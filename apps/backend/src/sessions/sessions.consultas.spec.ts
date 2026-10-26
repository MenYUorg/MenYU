import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { SessionJwtPayload } from '../auth/guards/session-auth.guard'
import { SALON } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { CuentaDeClienteService } from '../auth/supabase/cuenta-de-cliente.service'
import { DivisionService } from '../comensales/division.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { PrismaService } from '../prisma/prisma.service'
import { SessionsService } from './sessions.service'

import { CUENTAS } from '../test/acceso-de-test'

// Cierre de sesiones y las consultas del salón (mesa activa, sesiones activas, pagadas e historial). El rol lo decide
// AccesoService (con sus propios tests): acá es un doble. En las consultas por restaurante lo exige la ruta.
const acceso = { exigirRol: jest.fn() }

const prisma = {
  sesionMesa: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  sesionMesaCliente: { count: jest.fn() },
  mesa: { findUnique: jest.fn(), update: jest.fn() },
  pedidoItem: { findMany: jest.fn() },
  llamadoMozo: { findFirst: jest.fn() },
  pedido: { findMany: jest.fn() },
  $transaction: jest.fn(),
}
const gateway = { emitSesionCerrada: jest.fn() }

const MOZO = CUENTAS.MOZO
const SESION_JWT: SessionJwtPayload = { sub: 'cli-1', tipo: 'cliente', sesionId: 'ses-1', mesaId: 'mesa-1', restauranteId: 'rest-1' }
const MESA = { id: 'mesa-1', restauranteId: 'rest-1', numero: '4' }

const fecha = (iso: string) => new Date(iso)
const item = (precio: number, cantidad: number, cantidadEditada: number | null = null) => ({
  precioUnitario: precio,
  cantidad,
  cantidadEditada,
})

describe('SessionsService: cierre y consultas del staff', () => {
  let service: SessionsService

  beforeEach(() => {
    jest.clearAllMocks()
    acceso.exigirRol.mockResolvedValue(['MOZO'])
    // $transaction recibe las operaciones ya armadas: devuelve sus resultados.
    prisma.$transaction.mockImplementation((operaciones: unknown[]) => Promise.all(operaciones))
    prisma.sesionMesa.update.mockResolvedValue({})
    prisma.mesa.update.mockResolvedValue({})
    service = new SessionsService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      gateway as unknown as MenyuGateway,
      {} as DivisionService,
      acceso as unknown as AccesoService,
      {} as CuentaDeClienteService,
    )
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('close (el comensal cierra su sesión)', () => {
    it('cierra la sesión, libera la mesa y avisa al restaurante', async () => {
      // Arrange
      prisma.sesionMesa.findUnique.mockResolvedValue({ id: 'ses-1', estado: 'activa' })

      // Act
      const resultado = await service.close(SESION_JWT)

      // Assert
      expect(resultado).toEqual({ ok: true })
      expect(prisma.sesionMesa.update).toHaveBeenCalledWith({
        where: { id: 'ses-1' },
        data: { estado: 'cerrada', cerradaEn: expect.any(Date) },
      })
      expect(prisma.mesa.update).toHaveBeenCalledWith({ where: { id: 'mesa-1' }, data: { estado: 'libre' } })
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(gateway.emitSesionCerrada).toHaveBeenCalledWith('rest-1', 'ses-1')
    })

    it('si la sesión no existe responde 404', async () => {
      prisma.sesionMesa.findUnique.mockResolvedValue(null)

      await expect(service.close(SESION_JWT)).rejects.toThrow(new NotFoundException('Sesión no encontrada'))
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('si la sesión ya está cerrada responde 400 y no avisa', async () => {
      prisma.sesionMesa.findUnique.mockResolvedValue({ id: 'ses-1', estado: 'cerrada' })

      await expect(service.close(SESION_JWT)).rejects.toThrow(new BadRequestException('La sesión ya está cerrada'))
      expect(gateway.emitSesionCerrada).not.toHaveBeenCalled()
    })
  })

  describe('cerrarMesaAdmin (el staff cierra la mesa)', () => {
    it('cierra la sesión activa de la mesa, la libera y avisa', async () => {
      // Arrange
      prisma.mesa.findUnique.mockResolvedValue(MESA)
      prisma.sesionMesa.findFirst.mockResolvedValue({ id: 'ses-9' })

      // Act
      const resultado = await service.cerrarMesaAdmin('mesa-1', MOZO)

      // Assert
      expect(resultado).toEqual({ ok: true })
      expect(acceso.exigirRol).toHaveBeenCalledWith(MOZO.id, 'rest-1', SALON)
      expect(prisma.sesionMesa.findFirst).toHaveBeenCalledWith({ where: { mesaId: 'mesa-1', estado: 'activa' } })
      expect(prisma.sesionMesa.update).toHaveBeenCalledWith({
        where: { id: 'ses-9' },
        data: { estado: 'cerrada', cerradaEn: expect.any(Date) },
      })
      expect(prisma.mesa.update).toHaveBeenCalledWith({ where: { id: 'mesa-1' }, data: { estado: 'libre' } })
      expect(gateway.emitSesionCerrada).toHaveBeenCalledWith('rest-1', 'ses-9')
    })

    it('si la mesa no existe responde 404 sin chequear acceso', async () => {
      prisma.mesa.findUnique.mockResolvedValue(null)

      await expect(service.cerrarMesaAdmin('mesa-x', MOZO)).rejects.toThrow(new NotFoundException('Mesa no encontrada'))
      expect(acceso.exigirRol).not.toHaveBeenCalled()
    })

    it('sin acceso al restaurante no busca la sesión', async () => {
      prisma.mesa.findUnique.mockResolvedValue(MESA)
      acceso.exigirRol.mockRejectedValue(new ForbiddenException('No tenés permiso para esta acción'))

      await expect(service.cerrarMesaAdmin('mesa-1', MOZO)).rejects.toThrow(ForbiddenException)
      expect(prisma.sesionMesa.findFirst).not.toHaveBeenCalled()
    })

    it('sin sesión activa responde 404', async () => {
      prisma.mesa.findUnique.mockResolvedValue(MESA)
      prisma.sesionMesa.findFirst.mockResolvedValue(null)

      await expect(service.cerrarMesaAdmin('mesa-1', MOZO)).rejects.toThrow(
        new NotFoundException('No hay sesión activa en esta mesa'),
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('getSessionActiva (detalle de la mesa)', () => {
    beforeEach(() => {
      prisma.mesa.findUnique.mockResolvedValue(MESA)
    })

    it('arma el detalle: personas, total sin cancelados, llamado pendiente y pedidos con sus modificaciones', async () => {
      // Arrange
      prisma.sesionMesa.findFirst.mockResolvedValue({ id: 'ses-1', iniciadaEn: fecha('2026-10-18T20:00:00Z') })
      prisma.sesionMesaCliente.count.mockResolvedValue(3)
      prisma.pedidoItem.findMany.mockResolvedValue([item(1500, 2), item(800, 1)])
      prisma.llamadoMozo.findFirst.mockResolvedValue({ id: 'll-1', motivo: null })
      prisma.pedido.findMany.mockResolvedValue([
        {
          id: 'ped-1',
          estado: 'pendiente',
          createdAt: fecha('2026-10-18T20:05:00Z'),
          items: [
            {
              id: 'pi-1',
              cantidad: 2,
              precioUnitario: '1500.00',
              item: { nombre: 'Milanesa' },
              mods: [{ accion: 'QUITAR', itemIngrediente: { ingrediente: { nombre: 'Cebolla' } } }],
            },
          ],
        },
      ])

      // Act
      const detalle = await service.getSessionActiva('mesa-1', MOZO)

      // Assert
      expect(acceso.exigirRol).toHaveBeenCalledWith(MOZO.id, 'rest-1', SALON)
      expect(prisma.pedidoItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { pedido: { sesionId: 'ses-1', estado: { not: 'cancelado' } } } }),
      )
      expect(detalle).toEqual({
        sesionId: 'ses-1',
        creadaEn: '2026-10-18T20:00:00.000Z',
        cantidadClientes: 3,
        totalAcumulado: 3800,
        llamadoActivo: { id: 'll-1', motivo: 'general' },
        pedidos: [
          {
            id: 'ped-1',
            estado: 'pendiente',
            createdAt: '2026-10-18T20:05:00.000Z',
            items: [
              {
                id: 'pi-1',
                cantidad: 2,
                precioUnitario: 1500,
                itemNombre: 'Milanesa',
                modificaciones: [{ ingredienteNombre: 'Cebolla', tipo: 'QUITAR' }],
              },
            ],
          },
        ],
      })
    })

    it('sin llamado pendiente, llamadoActivo es null', async () => {
      prisma.sesionMesa.findFirst.mockResolvedValue({ id: 'ses-1', iniciadaEn: fecha('2026-10-18T20:00:00Z') })
      prisma.sesionMesaCliente.count.mockResolvedValue(1)
      prisma.pedidoItem.findMany.mockResolvedValue([])
      prisma.llamadoMozo.findFirst.mockResolvedValue(null)
      prisma.pedido.findMany.mockResolvedValue([])

      const detalle = await service.getSessionActiva('mesa-1', MOZO)

      expect(detalle).toMatchObject({ totalAcumulado: 0, llamadoActivo: null, pedidos: [] })
    })

    it('si la mesa no tiene sesión activa devuelve null', async () => {
      prisma.sesionMesa.findFirst.mockResolvedValue(null)

      await expect(service.getSessionActiva('mesa-1', MOZO)).resolves.toBeNull()
      expect(prisma.pedido.findMany).not.toHaveBeenCalled()
    })

    it('si la mesa no existe responde 404', async () => {
      prisma.mesa.findUnique.mockResolvedValue(null)

      await expect(service.getSessionActiva('mesa-x', MOZO)).rejects.toThrow(new NotFoundException('Mesa no encontrada'))
    })
  })

  describe('getSessionesActivas (las mesas abiertas del restaurante)', () => {
    it('por sesión: minutos abierta, ítems y total con las cantidades editadas, personas y si pidió pagar en efectivo', async () => {
      // Arrange
      jest.useFakeTimers({ now: fecha('2026-10-18T21:00:00Z') })
      prisma.sesionMesa.findMany.mockResolvedValue([
        {
          id: 'ses-1',
          iniciadaEn: fecha('2026-10-18T20:15:30Z'),
          mesa: { id: 'mesa-1', numero: '4' },
          participantes: [{ id: 'c1' }, { id: 'c2' }],
          pedidos: [{ items: [item(1000, 3, 1), item(500, 2)] }, { items: [item(200, 1)] }],
          pagos: [{ metodo: 'efectivo', estado: 'pendiente', fechaCobro: null }],
        },
        {
          id: 'ses-2',
          iniciadaEn: fecha('2026-10-18T20:59:59Z'),
          mesa: { id: 'mesa-2', numero: '7' },
          participantes: [],
          pedidos: [],
          pagos: [{ metodo: 'efectivo', estado: 'aprobado', fechaCobro: fecha('2026-10-18T20:59:00Z') }],
        },
      ])

      // Act
      const sesiones = await service.getSessionesActivas('rest-1')

      // Assert
      expect(prisma.sesionMesa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { mesa: { restauranteId: 'rest-1' }, estado: 'activa' }, orderBy: { iniciadaEn: 'asc' } }),
      )
      expect(sesiones).toEqual([
        { id: 'ses-1', mesaId: 'mesa-1', mesaNumero: '4', tiempoTranscurrido: 44, cantidadItems: 4, cantidadPersonas: 2, totalAcumulado: 2200, quierePagar: true },
        { id: 'ses-2', mesaId: 'mesa-2', mesaNumero: '7', tiempoTranscurrido: 0, cantidadItems: 0, cantidadPersonas: 0, totalAcumulado: 0, quierePagar: false },
      ])
    })
  })

  describe('getSessionesPagadas (caja)', () => {
    const sesionPagada = (pagos: object[], cerradaEn: Date | null = fecha('2026-10-18T22:00:00Z')) => ({
      id: 'ses-1',
      cerradaEn,
      mesa: { numero: '4' },
      pedidos: [{ items: [item(1000, 2), item(500, 3, 1)] }],
      pagos,
    })
    const pago = (id: string, extra: object) => ({
      id,
      metodo: 'efectivo',
      estado: 'aprobado',
      cobradoPorNombre: null,
      referenciaExterna: null,
      fechaCobro: null,
      mozo: null,
      usuario: null,
      ...extra,
    })

    it('con un solo pago aprobado informa su método, quién cobró (o el mozo) y la fecha de cobro', async () => {
      // Arrange
      prisma.sesionMesa.findMany.mockResolvedValue([
        sesionPagada([
          pago('p1', { metodo: 'mercadopago', referenciaExterna: 'mp-123', fechaCobro: fecha('2026-10-18T21:50:00Z'), mozo: { nombre: 'Ana' } }),
          pago('p2', { estado: 'cancelado' }),
        ]),
      ])

      // Act
      const [sesion] = await service.getSessionesPagadas('rest-1', undefined)

      // Assert
      expect(prisma.sesionMesa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { mesa: { restauranteId: 'rest-1' }, estado: 'cerrada', pagos: { some: { estado: 'aprobado' } } },
        }),
      )
      expect(sesion).toEqual({
        id: 'ses-1',
        mesaNumero: '4',
        totalCobrado: 2500,
        metodoPago: 'mercadopago',
        cobradoPorNombre: 'Ana',
        referenciaExterna: 'mp-123',
        fechaCobro: '2026-10-18T21:50:00.000Z',
        pagos: [
          { id: 'p1', metodo: 'mercadopago', estado: 'aprobado', cobradoPorNombre: null, referenciaExterna: 'mp-123', fechaCobro: '2026-10-18T21:50:00.000Z' },
        ],
      })
    })

    it('sin nombre guardado ni mozo, cobró la cuenta que lo registró (un GERENTE o el OWNER)', async () => {
      prisma.sesionMesa.findMany.mockResolvedValue([sesionPagada([pago('p1', { usuario: { nombre: 'Gabi' } })])])

      const [sesion] = await service.getSessionesPagadas('rest-1', undefined)

      expect(sesion).toMatchObject({ cobradoPorNombre: 'Gabi' })
    })

    it('un pago sin fecha de cobro usa el cierre de la sesión, y el nombre guardado gana al del mozo', async () => {
      prisma.sesionMesa.findMany.mockResolvedValue([sesionPagada([pago('p1', { cobradoPorNombre: 'Caja 1', mozo: { nombre: 'Ana' } })])])

      const [sesion] = await service.getSessionesPagadas('rest-1', undefined)

      expect(sesion).toMatchObject({ metodoPago: 'efectivo', cobradoPorNombre: 'Caja 1', referenciaExterna: null, fechaCobro: '2026-10-18T22:00:00.000Z' })
    })

    it('con varios pagos aprobados es "mixto", ordenados por cobro y con la fecha del más reciente', async () => {
      prisma.sesionMesa.findMany.mockResolvedValue([
        sesionPagada([
          pago('tarde', { fechaCobro: fecha('2026-10-18T21:40:00Z') }),
          pago('sin-fecha', {}),
          pago('temprano', { metodo: 'mercadopago', fechaCobro: fecha('2026-10-18T21:10:00Z') }),
        ]),
      ])

      const [sesion] = await service.getSessionesPagadas('rest-1', undefined)

      expect(sesion).toMatchObject({ metodoPago: 'mixto', cobradoPorNombre: null, referenciaExterna: null, fechaCobro: '2026-10-18T21:40:00.000Z' })
      expect(sesion.pagos.map((p) => p.id)).toEqual(['sin-fecha', 'temprano', 'tarde'])
    })

    it('varios pagos sin fecha de cobro usan el cierre de la sesión', async () => {
      prisma.sesionMesa.findMany.mockResolvedValue([sesionPagada([pago('a', {}), pago('b', {})])])

      const [sesion] = await service.getSessionesPagadas('rest-1', undefined)

      expect(sesion).toMatchObject({ metodoPago: 'mixto', fechaCobro: '2026-10-18T22:00:00.000Z' })
    })

    it('sin pagos aprobados en la lista el método es "desconocido" (y sin fecha de cierre, vacía)', async () => {
      prisma.sesionMesa.findMany.mockResolvedValue([sesionPagada([pago('p', { estado: 'pendiente' })], null)])

      const [sesion] = await service.getSessionesPagadas('rest-1', undefined)

      expect(sesion).toMatchObject({ metodoPago: 'desconocido', cobradoPorNombre: null, referenciaExterna: null, fechaCobro: '', pagos: [] })
    })

    it.each([
      ['hoy', '2026-10-18'],
      ['ayer', '2026-10-17'],
    ])('con fecha=%s filtra por el cierre en ese día (de 00:00 a 23:59:59.999)', async (filtro, dia) => {
      // Arrange
      jest.useFakeTimers({ now: new Date(2026, 9, 18, 15, 30) })
      prisma.sesionMesa.findMany.mockResolvedValue([])

      // Act
      await service.getSessionesPagadas('rest-1', filtro)

      // Assert
      const { where } = prisma.sesionMesa.findMany.mock.calls[0][0] as { where: { cerradaEn: { gte: Date; lte: Date } } }
      const [anio, mes, d] = dia.split('-').map(Number)
      expect(where.cerradaEn).toEqual({ gte: new Date(anio, mes - 1, d, 0, 0, 0, 0), lte: new Date(anio, mes - 1, d, 23, 59, 59, 999) })
    })
  })

  describe('getHistorialSesiones', () => {
    const sesionCerrada = {
      id: 'ses-1',
      iniciadaEn: fecha('2026-10-18T20:00:00Z'),
      cerradaEn: fecha('2026-10-18T22:00:00Z'),
      mesa: { numero: '4' },
      pedidos: [
        {
          id: 'ped-1',
          estado: 'entregado',
          createdAt: fecha('2026-10-18T20:10:00Z'),
          items: [
            {
              id: 'pi-1',
              cantidad: 3,
              cantidadEditada: 2,
              precioUnitario: '1000.00',
              item: { nombre: 'Empanada' },
              mods: [{ accion: 'AGREGAR', itemIngrediente: { ingrediente: { nombre: 'Picante' } } }],
            },
          ],
          ediciones: [
            {
              id: 'ed-1',
              justificacion: 'Se cargó de más',
              creadoEn: fecha('2026-10-18T20:20:00Z'),
              mozoId: null,
              usuarioId: 'usuario-gerente-viejo',
              mozo: null,
              usuario: { nombre: 'Gerente Histórico' },
              itemsEliminados: [{ itemNombre: 'Empanada', cantidadAntes: 3, cantidadDespues: 2, precioUnitario: '1000.00' }],
            },
            {
              id: 'ed-2',
              justificacion: 'Anulado',
              creadoEn: fecha('2026-10-18T20:30:00Z'),
              mozoId: 'mozo-1',
              usuarioId: 'usuario-mozo',
              mozo: { nombre: 'Ana' },
              usuario: { nombre: 'Ana López' },
              itemsEliminados: [{ itemNombre: 'Agua', cantidadAntes: 1, cantidadDespues: 0, precioUnitario: '500.00' }],
            },
            {
              id: 'ed-3',
              justificacion: 'x',
              creadoEn: fecha('2026-10-18T20:40:00Z'),
              mozoId: null,
              usuarioId: 'usuario-gerente',
              mozo: null,
              usuario: { nombre: 'Gabi' },
              itemsEliminados: [],
            },
            {
              id: 'ed-4',
              justificacion: 'y',
              creadoEn: fecha('2026-10-18T20:50:00Z'),
              mozoId: null,
              usuarioId: null,
              mozo: null,
              usuario: null,
              itemsEliminados: [],
            },
          ],
        },
        { id: 'ped-2', estado: 'entregado', createdAt: fecha('2026-10-18T21:00:00Z'), items: [], ediciones: [] },
      ],
    }

    it('devuelve las sesiones cerradas con sus pedidos, totales con cantidades editadas y las ediciones con su editor', async () => {
      // Arrange
      prisma.sesionMesa.findMany.mockResolvedValue([sesionCerrada])

      // Act
      const [sesion] = await service.getHistorialSesiones('rest-1', '2026-10-01', '2026-10-18')

      // Assert
      expect(prisma.sesionMesa.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            mesa: { restauranteId: 'rest-1' },
            estado: 'cerrada',
            cerradaEn: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-18T23:59:59.999Z') },
          },
        }),
      )
      expect(sesion).toMatchObject({
        sesionId: 'ses-1',
        mesaNumero: '4',
        iniciadaEn: '2026-10-18T20:00:00.000Z',
        cerradaEn: '2026-10-18T22:00:00.000Z',
        cantidadPedidos: 2,
        totalSesion: 2000,
      })
      const [pedido, sinEdiciones] = sesion.pedidos
      expect(pedido).toMatchObject({ id: 'ped-1', totalPedido: 2000, tieneEdiciones: true })
      expect(pedido.items).toEqual([
        { id: 'pi-1', cantidad: 3, cantidadEditada: 2, precioUnitario: 1000, itemNombre: 'Empanada', mods: [{ accion: 'AGREGAR', ingredienteNombre: 'Picante' }] },
      ])
      expect(pedido.ediciones.map((e) => e.editor)).toEqual([
        { nombre: 'Gerente Histórico', tipo: 'gerente' },
        { nombre: 'Ana', tipo: 'mozo' },
        { nombre: 'Gabi', tipo: 'gerente' },
        { nombre: 'Desconocido', tipo: 'mozo' },
      ])
      expect(pedido.ediciones[0]).toMatchObject({ id: 'ed-1', justificacion: 'Se cargó de más', creadoEn: '2026-10-18T20:20:00.000Z' })
      expect(pedido.ediciones.flatMap((e) => e.itemsEliminados)).toEqual([
        { itemNombre: 'Empanada', cantidadAntes: 3, cantidadDespues: 2, precioUnitario: 1000, esAnulacion: false },
        { itemNombre: 'Agua', cantidadAntes: 1, cantidadDespues: 0, precioUnitario: 500, esAnulacion: true },
      ])
      expect(sinEdiciones).toMatchObject({ totalPedido: 0, tieneEdiciones: false, items: [], ediciones: [] })
    })

    it('sin fechas usa el día de hoy (UTC) para desde y hasta', async () => {
      jest.useFakeTimers({ now: fecha('2026-10-18T15:00:00Z') })
      prisma.sesionMesa.findMany.mockResolvedValue([])

      await service.getHistorialSesiones('rest-1', undefined, undefined)

      const { where } = prisma.sesionMesa.findMany.mock.calls[0][0] as { where: { cerradaEn: object } }
      expect(where.cerradaEn).toEqual({ gte: new Date('2026-10-18T00:00:00.000Z'), lte: new Date('2026-10-18T23:59:59.999Z') })
    })
  })
})
