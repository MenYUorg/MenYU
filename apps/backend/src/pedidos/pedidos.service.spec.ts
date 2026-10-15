import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request } from 'express'
import { Prisma } from '@prisma/client'
import { PedidosService } from './pedidos.service'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { JwtPayload } from '../auth/auth.service'

const mockPrisma = {
  pedido: { findUnique: jest.fn(), findMany: jest.fn() },
  sesionMesa: { findUnique: jest.fn() },
  mesa: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}
const mockJwt = { verify: jest.fn(), sign: jest.fn() }
const mockGateway = { emitOrderEdited: jest.fn(), emitOrderNew: jest.fn() }

function createTxMock() {
  return {
    pedidoItem: { update: jest.fn() },
    pedido: { update: jest.fn() },
    pedidoEdicion: { create: jest.fn() },
  }
}

describe('PedidosService', () => {
  let service: PedidosService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PedidosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: MenyuGateway, useValue: mockGateway },
      ],
    }).compile()

    service = module.get(PedidosService)
    jest.clearAllMocks()
  })

  describe('editarPedido', () => {
    const REQ = { user: { sub: 'admin-1', tipo: 'admin', rol: 'GERENTE' } } as unknown as Request
    const DTO = {
      justificacion: 'El cliente se arrepintió',
      ediciones: [{ pedidoItemId: 'item-1', cantidadNueva: 1 }],
    }
    const pedidoBase = (pagos: { id: string }[]) => ({
      id: 'ped-1',
      estado: 'pendiente',
      mesa: { restauranteId: 'rest-1' },
      sesion: { pagos },
      items: [
        { id: 'item-1', cantidad: 3, cantidadEditada: null, precioUnitario: 100, item: { nombre: 'Milanesa' } },
      ],
    })
    let tx: ReturnType<typeof createTxMock>

    beforeEach(() => {
      tx = createTxMock()
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
    })

    it('sesión con un pago aprobado → 400 con el texto acordado y no toca el pedido', async () => {
      mockPrisma.pedido.findUnique.mockResolvedValueOnce(pedidoBase([{ id: 'pago-1' }]))

      const promesa = service.editarPedido('ped-1', DTO, REQ)

      await expect(promesa).rejects.toThrow(BadRequestException)
      await expect(promesa).rejects.toThrow(
        'La mesa ya tiene un cobro registrado y el pedido no puede editarse.',
      )
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(tx.pedidoItem.update).not.toHaveBeenCalled()
      expect(tx.pedidoEdicion.create).not.toHaveBeenCalled()
      expect(mockGateway.emitOrderEdited).not.toHaveBeenCalled()
    })

    it('sesión sin pagos aprobados → edita normalmente', async () => {
      const resultado = { id: 'ped-1', mesa: { numero: '5' }, items: [], ediciones: [] }
      mockPrisma.pedido.findUnique
        .mockResolvedValueOnce(pedidoBase([]))
        .mockResolvedValueOnce(resultado)

      const r = await service.editarPedido('ped-1', DTO, REQ)

      expect(tx.pedidoItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { cantidadEditada: 1 },
      })
      expect(tx.pedido.update).not.toHaveBeenCalled() // no se anula: queda 1 unidad
      expect(tx.pedidoEdicion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pedidoId: 'ped-1',
          adminId: 'admin-1',
          mozoId: null,
          justificacion: 'El cliente se arrepintió',
        }),
      })
      expect(mockGateway.emitOrderEdited).toHaveBeenCalledWith('rest-1', r)
      expect(r).toMatchObject({ id: 'ped-1' })
    })

    it('la consulta pide los pagos aprobados de la sesión y ya no navega asignaciones → comensal → pagos', async () => {
      mockPrisma.pedido.findUnique.mockResolvedValueOnce(pedidoBase([{ id: 'pago-1' }]))

      await service.editarPedido('ped-1', DTO, REQ).catch(() => undefined)

      const arg = mockPrisma.pedido.findUnique.mock.calls[0][0]
      expect(arg.include.sesion).toEqual({
        select: { pagos: { where: { estado: 'aprobado' }, select: { id: true } } },
      })
      expect(arg.include.items.include).not.toHaveProperty('asignaciones')
    })
  })

  describe('listarPorEstado', () => {
    const pedido = (id: string, pagos: { id: string }[], items: { id: string }[] = [{ id: 'i1' }]) => ({
      id,
      estado: 'listo',
      mesa: { numero: '5' },
      sesion: { pagos },
      items,
    })

    it('pagado es true si la sesión tiene un pago aprobado, false si no, y false si el pedido no tiene ítems', async () => {
      mockPrisma.pedido.findMany.mockResolvedValue([
        pedido('p-cobrado', [{ id: 'pago-1' }]),
        pedido('p-abierto', []),
        pedido('p-vacio', [{ id: 'pago-1' }], []),
      ])

      const r = await service.listarPorEstado('rest-1', 'listo')

      expect(r.map((p) => [p.id, p.pagado])).toEqual([
        ['p-cobrado', true],
        ['p-abierto', false],
        ['p-vacio', false],
      ])
    })

    it('la respuesta no expone la sesión y la consulta ya no pide asignaciones', async () => {
      mockPrisma.pedido.findMany.mockResolvedValue([pedido('p1', [])])

      const [r] = await service.listarPorEstado('rest-1', 'listo')

      expect(r).not.toHaveProperty('sesion')
      expect(r).toHaveProperty('pagado')
      const arg = mockPrisma.pedido.findMany.mock.calls[0][0]
      expect(arg.include.sesion).toEqual({
        select: { pagos: { where: { estado: 'aprobado' }, select: { id: true } } },
      })
      expect(arg.include.items.include).not.toHaveProperty('asignaciones')
    })
  })

  // ── Precio de cobro: descuentos ────────────────────────────────────────────────
  //
  // confirmar (comensal) y crearStaff (mozo o gerente) arman el precioUnitario que queda guardado en el
  // pedido: parten del precio vigente (con descuento si el ítem lo tiene) y los extras se cobran a precio
  // normal. QUITAR conserva el comportamiento de cada camino: confirmar resta el extra y crearStaff no.

  describe('precio de cobro con descuentos', () => {
    const ITEM_EN_BD = {
      id: 'item-1',
      restauranteId: 'rest-1',
      precioBase: new Prisma.Decimal('1500.00'),
      precioDescuento: null as number | null,
    }
    const ING_QUESO = {
      id: 'ii-queso',
      itemId: 'item-1',
      esAgregable: true,
      esRemovible: true,
      precioExtra: new Prisma.Decimal('150.00'),
    }

    function createTxPedidoMock() {
      return {
        sesionMesa: { findUnique: jest.fn().mockResolvedValue({ id: 'ses-1', estado: 'activa' }) },
        itemMenu: { findFirst: jest.fn() },
        itemIngrediente: { findUnique: jest.fn().mockResolvedValue(ING_QUESO) },
        pedido: { create: jest.fn().mockResolvedValue({ id: 'ped-1', mesa: { numero: '5' }, items: [] }) },
      }
    }

    // precioUnitario de cada ítem que se mandó a crear
    const precioGuardado = (tx: ReturnType<typeof createTxPedidoMock>): number[] =>
      tx.pedido.create.mock.calls[0][0].data.items.create.map((i: { precioUnitario: number }) => i.precioUnitario)

    const mods = (accion: 'AGREGAR' | 'QUITAR', cantidad: number) => [
      { itemIngredienteId: 'ii-queso', accion, cantidad },
    ]
    const dtoConItem = (cantidad = 1, modificaciones?: ReturnType<typeof mods>) => ({
      sesionId: 'ses-1',
      mesaId: 'mesa-1',
      items: [{ itemId: 'item-1', cantidad, ...(modificaciones ? { mods: modificaciones } : {}) }],
    })

    describe('confirmar (comensal)', () => {
      const CLIENTE = { sub: 'cli-1', tipo: 'cliente', sesionId: 'ses-1', mesaId: 'mesa-1', restauranteId: 'rest-1' }
      let tx: ReturnType<typeof createTxPedidoMock>

      beforeEach(() => {
        tx = createTxPedidoMock()
        mockJwt.verify.mockReturnValue(CLIENTE)
        mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      })

      it('sin descuento se cobra el precio base, como antes', async () => {
        tx.itemMenu.findFirst.mockResolvedValue(ITEM_EN_BD)

        await service.confirmar('Bearer token', dtoConItem(2))

        expect(precioGuardado(tx)).toEqual([1500])
      })

      it('con descuento se cobra el precio con descuento', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1200 })

        await service.confirmar('Bearer token', dtoConItem(2))

        expect(precioGuardado(tx)).toEqual([1200])
      })

      it('un extra agregado se suma a precio normal sobre el precio con descuento', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1200 })

        await service.confirmar('Bearer token', dtoConItem(1, mods('AGREGAR', 2)))

        expect(precioGuardado(tx)).toEqual([1500]) // 1200 + 150 × 2
      })

      it('quitar un ingrediente mantiene el comportamiento actual (resta el extra) sobre el precio con descuento', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1200 })

        await service.confirmar('Bearer token', dtoConItem(1, mods('QUITAR', 1)))

        expect(precioGuardado(tx)).toEqual([1050]) // 1200 - 150
      })

      it('un descuento guardado que no es válido contra el precio base se ignora: se cobra el base', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1500 })

        await service.confirmar('Bearer token', dtoConItem())

        expect(precioGuardado(tx)).toEqual([1500])
      })

      it('emite el pedido nuevo al restaurante', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1200 })

        await service.confirmar('Bearer token', dtoConItem())

        expect(mockGateway.emitOrderNew).toHaveBeenCalledWith('rest-1', expect.objectContaining({ id: 'ped-1' }))
      })
    })

    describe('crearStaff (mozo o gerente)', () => {
      const MOZO: JwtPayload = { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }
      let tx: ReturnType<typeof createTxPedidoMock>

      beforeEach(() => {
        tx = createTxPedidoMock()
        mockPrisma.sesionMesa.findUnique.mockResolvedValue({ id: 'ses-1', estado: 'activa' })
        mockPrisma.mesa.findUnique.mockResolvedValue({ id: 'mesa-1', restauranteId: 'rest-1' })
        mockPrisma.$transaction.mockImplementation((fn: any) => fn(tx))
      })

      it('sin descuento se cobra el precio base, como antes', async () => {
        tx.itemMenu.findFirst.mockResolvedValue(ITEM_EN_BD)

        await service.crearStaff(dtoConItem(2), MOZO)

        expect(precioGuardado(tx)).toEqual([1500])
      })

      it('con descuento se cobra el precio con descuento', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1200 })

        await service.crearStaff(dtoConItem(2), MOZO)

        expect(precioGuardado(tx)).toEqual([1200])
      })

      it('un extra agregado se suma a precio normal sobre el precio con descuento', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1200 })

        await service.crearStaff(dtoConItem(1, mods('AGREGAR', 2)), MOZO)

        expect(precioGuardado(tx)).toEqual([1500]) // 1200 + 150 × 2
      })

      it('quitar un ingrediente no altera el precio, como antes', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1200 })

        await service.crearStaff(dtoConItem(1, mods('QUITAR', 1)), MOZO)

        expect(precioGuardado(tx)).toEqual([1200])
      })

      it('un descuento guardado que no es válido contra el precio base se ignora: se cobra el base', async () => {
        tx.itemMenu.findFirst.mockResolvedValue({ ...ITEM_EN_BD, precioDescuento: 1600 })

        await service.crearStaff(dtoConItem(), MOZO)

        expect(precioGuardado(tx)).toEqual([1500])
      })
    })
  })
})
