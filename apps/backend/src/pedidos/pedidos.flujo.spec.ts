import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import { AccesoService } from '../auth/supabase/acceso.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { accesoDeTest, CUENTAS, MOZOS, MUNDO } from '../test/acceso-de-test'
import { PedidosService } from './pedidos.service'

// Validaciones de los pedidos (del comensal y del personal), el avance de estado, la edición y su historial, con
// las membresías de CUENTAS. Los precios con descuento están en pedidos.service.spec.
const prisma = {
  pedido: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  pedidoEdicion: { findMany: jest.fn() },
  sesionMesa: { findUnique: jest.fn() },
  mesa: { findUnique: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
}
const REST = MUNDO.REST_1
const jwt = { verify: jest.fn() }
const gateway = { emitOrderNew: jest.fn(), emitOrderUpdated: jest.fn(), emitOrderEdited: jest.fn() }

const ITEM = { id: 'item-1', restauranteId: 'rest-1', precioBase: new Prisma.Decimal('1500.00'), precioDescuento: null }
const ingrediente = (extra: object = {}) => ({
  id: 'ii-1',
  itemId: 'item-1',
  esAgregable: true,
  esRemovible: true,
  precioExtra: new Prisma.Decimal('100.00'),
  ...extra,
})
const DTO = (mods?: { itemIngredienteId: string; accion: 'AGREGAR' | 'QUITAR'; cantidad: number }[]) => ({
  sesionId: 'ses-1',
  mesaId: 'mesa-1',
  items: [{ itemId: 'item-1', cantidad: 1, ...(mods ? { mods } : {}) }],
})

function crearTx() {
  return {
    sesionMesa: { findUnique: jest.fn().mockResolvedValue({ id: 'ses-1', estado: 'activa' }) },
    itemMenu: { findFirst: jest.fn().mockResolvedValue(ITEM) },
    itemIngrediente: { findUnique: jest.fn().mockResolvedValue(ingrediente()) },
    pedido: { create: jest.fn().mockResolvedValue({ id: 'ped-1' }), update: jest.fn() },
    pedidoItem: { update: jest.fn() },
    pedidoEdicion: { create: jest.fn() },
  }
}

describe('PedidosService: validaciones, estado y ediciones', () => {
  let service: PedidosService
  let acceso: AccesoService
  let tx: ReturnType<typeof crearTx>

  beforeEach(() => {
    jest.clearAllMocks()
    tx = crearTx()
    prisma.$transaction.mockImplementation((fn: (cliente: typeof tx) => unknown) => fn(tx))
    acceso = accesoDeTest()
    service = new PedidosService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      gateway as unknown as MenyuGateway,
      acceso,
    )
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('confirmar (comensal)', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({ sub: 'cli-1', tipo: 'cliente', sesionId: 'ses-1', mesaId: 'mesa-1', restauranteId: 'rest-1' })
    })

    it.each([
      ['sin encabezado', undefined],
      ['con otro esquema', 'Basic abc'],
    ])('%s responde 401 sin verificar nada', async (_, encabezado) => {
      await expect(service.confirmar(encabezado, DTO())).rejects.toThrow(new UnauthorizedException('Session JWT requerido'))
      expect(jwt.verify).not.toHaveBeenCalled()
    })

    it('un JWT que no verifica responde 401', async () => {
      jwt.verify.mockImplementation(() => { throw new Error('jwt expired') })

      await expect(service.confirmar('Bearer x', DTO())).rejects.toThrow(new UnauthorizedException('Session JWT inválido o expirado'))
    })

    it('un JWT que no es de comensal responde 401', async () => {
      jwt.verify.mockReturnValue({ sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' })

      await expect(service.confirmar('Bearer x', DTO())).rejects.toThrow(new UnauthorizedException('Solo clientes pueden crear pedidos'))
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('un token de invitado (tipo cliente, sin sesión de mesa) responde 401', async () => {
      jwt.verify.mockReturnValue({ sub: 'cli-invitado', tipo: 'cliente', nombre: 'Invitado' })

      await expect(service.confirmar('Bearer x', DTO())).rejects.toThrow(new UnauthorizedException('Este recurso requiere una sesión de mesa'))
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it.each([
      ['la sesión', { ...DTO(), sesionId: 'ses-de-otra-mesa' }, new ForbiddenException('Esa sesión de mesa no es la tuya')],
      ['la mesa', { ...DTO(), mesaId: 'otra-mesa' }, new ForbiddenException('Esa mesa no es la de tu sesión')],
    ])('si %s del pedido no es la del token responde 403 sin crear nada', async (_, dto, error) => {
      await expect(service.confirmar('Bearer x', dto)).rejects.toThrow(error)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it.each([
      ['no existe', null, new NotFoundException('Sesión no encontrada')],
      ['no está activa', { id: 'ses-1', estado: 'cerrada' }, new BadRequestException('La sesión no está activa')],
    ])('si la sesión %s no crea el pedido', async (_, sesion, error) => {
      tx.sesionMesa.findUnique.mockResolvedValue(sesion)

      await expect(service.confirmar('Bearer x', DTO())).rejects.toThrow(error)
      expect(tx.pedido.create).not.toHaveBeenCalled()
      expect(gateway.emitOrderNew).not.toHaveBeenCalled()
    })

    it('un ítem que no es del restaurante del comensal responde 404', async () => {
      tx.itemMenu.findFirst.mockResolvedValue(null)

      await expect(service.confirmar('Bearer x', DTO())).rejects.toThrow(
        new NotFoundException('Ítem item-1 no encontrado en este restaurante'),
      )
      expect(tx.itemMenu.findFirst).toHaveBeenCalledWith({ where: { id: 'item-1', restauranteId: 'rest-1' } })
    })

    it.each([
      ['no existe', null, 'AGREGAR', new NotFoundException('ItemIngrediente ii-1 no encontrado')],
      ['es de otro ítem', ingrediente({ itemId: 'item-2' }), 'AGREGAR', new BadRequestException('Modificador no pertenece al ítem')],
      ['no se puede agregar', ingrediente({ esAgregable: false }), 'AGREGAR', new BadRequestException('El ingrediente ii-1 no es agregable')],
      ['no se puede quitar', ingrediente({ esRemovible: false }), 'QUITAR', new BadRequestException('El ingrediente ii-1 no es removible')],
    ] as const)('un modificador que %s se rechaza', async (_, ing, accion, error) => {
      tx.itemIngrediente.findUnique.mockResolvedValue(ing)

      await expect(service.confirmar('Bearer x', DTO([{ itemIngredienteId: 'ii-1', accion, cantidad: 1 }]))).rejects.toThrow(error)
      expect(tx.pedido.create).not.toHaveBeenCalled()
    })

    it('guarda el pedido pendiente con el comensal, las notas y los modificadores', async () => {
      await service.confirmar('Bearer x', {
        ...DTO([{ itemIngredienteId: 'ii-1', accion: 'AGREGAR', cantidad: 1 }]),
        items: [{ itemId: 'item-1', cantidad: 2, notas: 'sin sal', mods: [{ itemIngredienteId: 'ii-1', accion: 'AGREGAR', cantidad: 1 }] }],
      })

      const { data } = tx.pedido.create.mock.calls[0][0]
      expect(data).toMatchObject({ sesionId: 'ses-1', mesaId: 'mesa-1', estado: 'pendiente' })
      expect(data.items.create).toEqual([
        {
          itemId: 'item-1',
          clienteId: 'cli-1',
          cantidad: 2,
          precioUnitario: 1600,
          notas: 'sin sal',
          mods: { create: [{ itemIngredienteId: 'ii-1', accion: 'AGREGAR', cantidad: 1 }] },
        },
      ])
    })
  })

  describe('crearStaff (el salón del restaurante de la mesa)', () => {
    const MOZO = CUENTAS.MOZO

    beforeEach(() => {
      prisma.sesionMesa.findUnique.mockResolvedValue({ id: 'ses-1', mesaId: 'mesa-1', estado: 'activa' })
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-1', restauranteId: REST })
    })

    it.each([
      ['la sesión no existe', () => prisma.sesionMesa.findUnique.mockResolvedValue(null), new NotFoundException('Sesión no encontrada')],
      ['la sesión no está activa', () => prisma.sesionMesa.findUnique.mockResolvedValue({ id: 'ses-1', mesaId: 'mesa-1', estado: 'cerrada' }), new BadRequestException('La sesión no está activa')],
      ['la sesión es de otra mesa', () => prisma.sesionMesa.findUnique.mockResolvedValue({ id: 'ses-1', mesaId: 'mesa-de-otro-restaurante', estado: 'activa' }), new BadRequestException('La sesión no es de esa mesa')],
      ['la mesa no existe', () => prisma.mesa.findUnique.mockResolvedValue(null), new NotFoundException('Mesa no encontrada')],
    ])('si %s no crea el pedido', async (_, preparar, error) => {
      preparar()

      await expect(service.crearStaff(DTO(), MOZO)).rejects.toThrow(error)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el MOZO', CUENTAS.MOZO],
    ])('%s del restaurante de la mesa crea el pedido', async (_caso, cuenta) => {
      await expect(service.crearStaff(DTO(), cuenta)).resolves.toEqual({ id: 'ped-1' })
    })

    it.each([
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['la COCINA', CUENTAS.COCINA],
    ])('%s recibe 403 antes de mirar la sesión', async (_caso, cuenta) => {
      await expect(service.crearStaff(DTO(), cuenta)).rejects.toThrow(ForbiddenException)
      expect(prisma.sesionMesa.findUnique).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('el MOZO de otro restaurante recibe 403', async () => {
      prisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-1', restauranteId: MUNDO.REST_2 })

      await expect(service.crearStaff(DTO(), MOZO)).rejects.toThrow(ForbiddenException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it.each([
      ['no existe', null, 'AGREGAR', NotFoundException],
      ['es de otro ítem', ingrediente({ itemId: 'item-2' }), 'AGREGAR', BadRequestException],
      ['no se puede agregar', ingrediente({ esAgregable: false }), 'AGREGAR', BadRequestException],
      ['no se puede quitar', ingrediente({ esRemovible: false }), 'QUITAR', BadRequestException],
    ] as const)('un modificador que %s se rechaza', async (_, ing, accion, error) => {
      tx.itemIngrediente.findUnique.mockResolvedValue(ing)

      await expect(service.crearStaff(DTO([{ itemIngredienteId: 'ii-1', accion, cantidad: 1 }]), MOZO)).rejects.toThrow(error)
      expect(tx.pedido.create).not.toHaveBeenCalled()
    })

    it('un ítem que no es del restaurante de la mesa responde 404', async () => {
      tx.itemMenu.findFirst.mockResolvedValue(null)

      await expect(service.crearStaff(DTO(), MOZO)).rejects.toThrow(new NotFoundException('Ítem item-1 no encontrado en este restaurante'))
    })
  })

  describe('actualizarEstado (todo el personal del restaurante del pedido, también la cocina)', () => {
    const COCINA = CUENTAS.COCINA

    it('si el pedido no existe responde 404', async () => {
      prisma.pedido.findUnique.mockResolvedValue(null)

      await expect(service.actualizarEstado('ped-x', { estado: 'listo' }, COCINA)).rejects.toThrow(new NotFoundException('Pedido no encontrado'))
    })

    it.each([
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['un Usuario sin membresías', CUENTAS.SIN_MEMBRESIAS],
    ])('%s recibe 403 y no se guarda nada', async (_caso, cuenta) => {
      prisma.pedido.findUnique.mockResolvedValue({ id: 'ped-1', estado: 'pendiente', mesa: { restauranteId: REST } })

      await expect(service.actualizarEstado('ped-1', { estado: 'en_preparacion' }, cuenta)).rejects.toThrow(ForbiddenException)
      expect(prisma.pedido.update).not.toHaveBeenCalled()
    })

    it.each([
      ['pendiente', 'en_preparacion'],
      ['en_preparacion', 'listo'],
      ['listo', 'entregado'],
    ])('de %s pasa a %s, lo guarda y lo avisa al restaurante', async (desde, hacia) => {
      // Arrange
      prisma.pedido.findUnique.mockResolvedValue({ id: 'ped-1', estado: desde, mesa: { restauranteId: REST } })
      prisma.pedido.update.mockResolvedValue({ id: 'ped-1', estado: hacia })

      // Act
      const actualizado = await service.actualizarEstado('ped-1', { estado: hacia }, COCINA)

      // Assert
      expect(actualizado).toEqual({ id: 'ped-1', estado: hacia })
      expect(prisma.pedido.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ped-1' }, data: { estado: hacia } }))
      expect(gateway.emitOrderUpdated).toHaveBeenCalledWith(REST, { id: 'ped-1', estado: hacia })
    })

    it.each([
      ['pendiente', 'listo'],
      ['listo', 'en_preparacion'],
      ['entregado', 'entregado'],
    ])('de %s a %s es una transición inválida (400) y no guarda', async (desde, hacia) => {
      prisma.pedido.findUnique.mockResolvedValue({ id: 'ped-1', estado: desde, mesa: { restauranteId: REST } })

      await expect(service.actualizarEstado('ped-1', { estado: hacia }, COCINA)).rejects.toThrow(
        new BadRequestException(`Transición inválida: ${desde} → ${hacia}`),
      )
      expect(prisma.pedido.update).not.toHaveBeenCalled()
      expect(gateway.emitOrderUpdated).not.toHaveBeenCalled()
    })
  })

  describe('editarPedido (GERENTE, JEFE_SALON o MOZO del restaurante del pedido)', () => {
    const MOZO = CUENTAS.MOZO
    const pedido = (extra: object = {}) => ({
      id: 'ped-1',
      estado: 'pendiente',
      mesa: { restauranteId: REST },
      sesion: { pagos: [] },
      items: [
        { id: 'pi-1', cantidad: 2, cantidadEditada: null, precioUnitario: 1000, item: { nombre: 'Milanesa' } },
        { id: 'pi-2', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, item: { nombre: 'Agua' } },
      ],
      ...extra,
    })
    const edicion = (ediciones: { pedidoItemId: string; cantidadNueva: number }[], justificacion = 'El cliente cambió de idea') => ({
      justificacion,
      ediciones,
    })

    it.each([
      ['el OWNER (como antes, no edita)', CUENTAS.OWNER_A],
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
      ['la COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ])('%s recibe 403 y no se edita nada', async (_caso, cuenta) => {
      prisma.pedido.findUnique.mockResolvedValue(pedido())

      await expect(service.editarPedido('ped-1', edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }]), cuenta)).rejects.toThrow(
        ForbiddenException,
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('un MOZO sin su perfil de mozo activo en el restaurante recibe 403', async () => {
      prisma.pedido.findUnique.mockResolvedValue(pedido())
      jest.spyOn(acceso, 'mozoDe').mockResolvedValue(null)

      await expect(service.editarPedido('ped-1', edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }]), MOZO)).rejects.toThrow(
        new ForbiddenException('Tu perfil de mozo no está activo en este restaurante'),
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it.each([
      ['el pedido no existe', null, edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }]), new NotFoundException('Pedido no encontrado')],
      ['el pedido está anulado', pedido({ estado: 'anulado' }), edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }]), new BadRequestException('No se puede editar un pedido anulado')],
      ['la justificación está vacía', pedido(), edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }], '   '), new BadRequestException('La justificación es requerida')],
      ['la justificación pasa las 50 palabras', pedido(), edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }], Array(51).fill('palabra').join(' ')), new BadRequestException('La justificación no puede superar 50 palabras')],
      ['un ítem no es del pedido', pedido(), edicion([{ pedidoItemId: 'pi-9', cantidadNueva: 0 }]), new BadRequestException('El ítem pi-9 no pertenece a este pedido')],
      ['la cantidad nueva no baja (contra la ya editada)', pedido(), edicion([{ pedidoItemId: 'pi-2', cantidadNueva: 1 }]), new BadRequestException('cantidadNueva debe ser menor a la cantidad actual del ítem (1)')],
    ])('si %s no edita', async (_, encontrado, dto, error) => {
      prisma.pedido.findUnique.mockResolvedValue(encontrado)

      await expect(service.editarPedido('ped-1', dto, MOZO)).rejects.toThrow(error)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('baja la cantidad, registra la edición del mozo (su Mozo sale de la cuenta) y avisa el pedido actualizado', async () => {
      // Arrange
      const actualizado = {
        id: 'ped-1',
        ediciones: [
          {
            id: 'ed-1',
            justificacion: 'El cliente cambió de idea',
            creadoEn: new Date('2026-10-18T20:00:00Z'),
            mozoId: MOZOS.DEL_MOZO.id,
            usuarioId: MOZO.id,
            mozo: { nombre: 'Ana' },
            usuario: { nombre: 'Ana López' },
            itemsEliminados: [{ id: 'ie-1', pedidoItemId: 'pi-1', itemNombre: 'Milanesa', cantidadAntes: 2, cantidadDespues: 1, precioUnitario: '1000.00' }],
          },
        ],
      }
      prisma.pedido.findUnique.mockResolvedValueOnce(pedido()).mockResolvedValueOnce(actualizado)

      // Act
      const resultado = await service.editarPedido('ped-1', edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }], '  El cliente cambió de idea  '), MOZO)

      // Assert
      expect(tx.pedidoItem.update).toHaveBeenCalledWith({ where: { id: 'pi-1' }, data: { cantidadEditada: 1 } })
      expect(tx.pedido.update).not.toHaveBeenCalled()
      expect(tx.pedidoEdicion.create).toHaveBeenCalledWith({
        data: {
          pedidoId: 'ped-1',
          usuarioId: MOZO.id,
          mozoId: MOZOS.DEL_MOZO.id,
          justificacion: 'El cliente cambió de idea',
          itemsEliminados: {
            create: [{ pedidoItemId: 'pi-1', itemNombre: 'Milanesa', cantidadAntes: 2, cantidadDespues: 1, precioUnitario: 1000 }],
          },
        },
      })
      expect(resultado.ediciones).toEqual([
        {
          id: 'ed-1',
          justificacion: 'El cliente cambió de idea',
          creadoEn: new Date('2026-10-18T20:00:00Z'),
          editor: { nombre: 'Ana', tipo: 'mozo' },
          itemsEliminados: [{ id: 'ie-1', itemNombre: 'Milanesa', cantidadAntes: 2, cantidadDespues: 1, precioUnitario: 1000 }],
        },
      ])
      expect(gateway.emitOrderEdited).toHaveBeenCalledWith(REST, resultado)
    })

    it('el JEFE_SALON edita con su propio Mozo', async () => {
      prisma.pedido.findUnique.mockResolvedValueOnce(pedido()).mockResolvedValueOnce({ id: 'ped-1', ediciones: [] })

      await service.editarPedido('ped-1', edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }]), CUENTAS.JEFE_SALON)

      expect(tx.pedidoEdicion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ usuarioId: CUENTAS.JEFE_SALON.id, mozoId: MOZOS.DEL_JEFE_SALON.id }),
      })
    })

    it('si todos los ítems quedan en 0, el pedido queda anulado (la edición del gerente lleva su cuenta, sin Mozo)', async () => {
      prisma.pedido.findUnique.mockResolvedValueOnce(pedido()).mockResolvedValueOnce({ id: 'ped-1', ediciones: [] })

      await service.editarPedido(
        'ped-1',
        edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 0 }, { pedidoItemId: 'pi-2', cantidadNueva: 0 }]),
        CUENTAS.GERENTE,
      )

      expect(tx.pedido.update).toHaveBeenCalledWith({ where: { id: 'ped-1' }, data: { estado: 'anulado' } })
      expect(tx.pedidoEdicion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuarioId: CUENTAS.GERENTE.id, mozoId: null }) })
    })

    it('si un ítem queda en 0 pero otro sigue, el pedido no se anula', async () => {
      prisma.pedido.findUnique.mockResolvedValueOnce(pedido()).mockResolvedValueOnce({ id: 'ped-1', ediciones: [] })

      await service.editarPedido('ped-1', edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 0 }]), MOZO)

      expect(tx.pedido.update).not.toHaveBeenCalled()
    })

    it('si el pedido desaparece después de editar responde 404 y no avisa', async () => {
      prisma.pedido.findUnique.mockResolvedValueOnce(pedido()).mockResolvedValueOnce(null)

      await expect(service.editarPedido('ped-1', edicion([{ pedidoItemId: 'pi-1', cantidadNueva: 1 }]), MOZO)).rejects.toThrow(
        new NotFoundException('Pedido no encontrado'),
      )
      expect(gateway.emitOrderEdited).not.toHaveBeenCalled()
    })
  })

  describe('auditoriaEdiciones', () => {
    it('sin restaurante responde 400', async () => {
      await expect(service.auditoriaEdiciones('')).rejects.toThrow(new BadRequestException('restauranteId es requerido'))
    })

    it('sin mesas, o sin pedidos en sus mesas, devuelve una lista vacía', async () => {
      prisma.mesa.findMany.mockResolvedValueOnce([])
      await expect(service.auditoriaEdiciones('rest-1')).resolves.toEqual([])

      prisma.mesa.findMany.mockResolvedValueOnce([{ id: 'mesa-1' }])
      prisma.pedido.findMany.mockResolvedValueOnce([])
      await expect(service.auditoriaEdiciones('rest-1')).resolves.toEqual([])
      expect(prisma.pedidoEdicion.findMany).not.toHaveBeenCalled()
    })

    it('lista las ediciones del rango con la mesa, el estado del pedido y si fue una anulación', async () => {
      // Arrange
      prisma.mesa.findMany.mockResolvedValue([{ id: 'mesa-1' }])
      prisma.pedido.findMany.mockResolvedValue([{ id: 'ped-1' }])
      const base = { justificacion: 'x', creadoEn: new Date('2026-10-10T12:00:00Z'), mozoId: null, usuarioId: 'u-ger', mozo: null, usuario: { nombre: 'Gabi' } }
      prisma.pedidoEdicion.findMany.mockResolvedValue([
        {
          ...base,
          id: 'ed-1',
          pedido: { id: 'ped-1', estado: 'anulado', mesa: { numero: '4' } },
          itemsEliminados: [{ id: 'ie-1', pedidoItemId: 'pi-1', itemNombre: 'Agua', cantidadAntes: 1, cantidadDespues: 0, precioUnitario: '500' }],
        },
        {
          ...base,
          id: 'ed-2',
          pedido: { id: 'ped-1', estado: 'pendiente', mesa: { numero: '4' } },
          itemsEliminados: [{ id: 'ie-2', pedidoItemId: 'pi-2', itemNombre: 'Pan', cantidadAntes: 3, cantidadDespues: 2, precioUnitario: '100' }],
        },
        { ...base, id: 'ed-3', pedido: { id: 'ped-1', estado: 'pendiente', mesa: { numero: '4' } }, itemsEliminados: [] },
      ])

      // Act
      const ediciones = await service.auditoriaEdiciones('rest-1', '2026-10-01', '2026-10-15')

      // Assert
      expect(prisma.pedidoEdicion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            pedidoId: { in: ['ped-1'] },
            creadoEn: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-15T23:59:59.999Z') },
          },
        }),
      )
      expect(ediciones.map((e) => [e.id, e.mesaNumero, e.pedidoEstado, e.esAnulacion])).toEqual([
        ['ed-1', '4', 'anulado', true],
        ['ed-2', '4', 'pendiente', false],
        ['ed-3', '4', 'pendiente', false],
      ])
      expect(ediciones[0].editor).toEqual({ nombre: 'Gabi', tipo: 'gerente' })
    })

    it('sin fechas usa el día de hoy (UTC)', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-18T15:00:00Z') })
      prisma.mesa.findMany.mockResolvedValue([{ id: 'mesa-1' }])
      prisma.pedido.findMany.mockResolvedValue([{ id: 'ped-1' }])
      prisma.pedidoEdicion.findMany.mockResolvedValue([])

      await service.auditoriaEdiciones('rest-1')

      expect(prisma.pedidoEdicion.findMany.mock.calls[0][0].where.creadoEn).toEqual({
        gte: new Date('2026-10-18T00:00:00.000Z'),
        lte: new Date('2026-10-18T23:59:59.999Z'),
      })
    })
  })

  describe('getEdiciones (OWNER o GERENTE del restaurante del pedido)', () => {
    const ADMIN = CUENTAS.GERENTE

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['ROOT', CUENTAS.ROOT],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ])('%s recibe 403', async (_caso, cuenta) => {
      prisma.pedido.findUnique.mockResolvedValue({ mesa: { restauranteId: REST } })

      await expect(service.getEdiciones('ped-1', cuenta)).rejects.toThrow(ForbiddenException)
      expect(prisma.pedidoEdicion.findMany).not.toHaveBeenCalled()
    })

    it('si el pedido no existe responde 404', async () => {
      prisma.pedido.findUnique.mockResolvedValue(null)

      await expect(service.getEdiciones('ped-x', ADMIN)).rejects.toThrow(new NotFoundException('Pedido no encontrado'))
    })

    it('devuelve las ediciones del pedido; sin admin ni mozo, el editor es "Desconocido"', async () => {
      prisma.pedido.findUnique.mockResolvedValue({ mesa: { restauranteId: REST } })
      prisma.pedidoEdicion.findMany.mockResolvedValue([
        { id: 'ed-1', justificacion: 'x', creadoEn: new Date('2026-10-18T20:00:00Z'), mozoId: null, usuarioId: null, mozo: null, usuario: null, itemsEliminados: [] },
      ])

      const ediciones = await service.getEdiciones('ped-1', CUENTAS.OWNER_A)

      expect(prisma.pedidoEdicion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pedidoId: 'ped-1' }, orderBy: { creadoEn: 'desc' } }))
      expect(ediciones).toEqual([
        { id: 'ed-1', justificacion: 'x', creadoEn: new Date('2026-10-18T20:00:00Z'), editor: { nombre: 'Desconocido', tipo: 'mozo' }, itemsEliminados: [] },
      ])
    })
  })
})
