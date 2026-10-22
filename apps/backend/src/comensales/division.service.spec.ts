import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DivisionService } from './division.service'
import { ComensalesService } from './comensales.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPrisma = {
  sesionMesa: { findUnique: jest.fn() },
  pedidoItem: { findMany: jest.fn() },
  pedido: { findMany: jest.fn() },
  pago: { findMany: jest.fn() },
}
const mockComensales = { listarComensales: jest.fn() }

const ANA = { id: 'c-ana', nombre: 'Ana' }
const BETO = { id: 'c-beto', nombre: 'Beto' }
const CARLA = { id: 'c-carla', nombre: 'Carla' }

// Las asignaciones vienen en el orden en que las devuelve la consulta (createdAt asc).
const pedidoItem = (
  id: string,
  nombre: string,
  precioUnitario: number,
  cantidad: number,
  asignados: string[],
  cantidadEditada: number | null = null,
) => ({
  id,
  item: { nombre },
  precioUnitario,
  cantidad,
  cantidadEditada,
  asignaciones: asignados.map((comensalId) => ({ comensalId })),
})

describe('DivisionService.calcularPorConsumo', () => {
  let service: DivisionService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DivisionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ComensalesService, useValue: mockComensales },
      ],
    }).compile()

    service = module.get(DivisionService)
    jest.clearAllMocks()
    mockPrisma.sesionMesa.findUnique.mockResolvedValue({ id: 'sesion-1' })
    mockComensales.listarComensales.mockResolvedValue([ANA, BETO, CARLA])
    mockPrisma.pedidoItem.findMany.mockResolvedValue([])
  })

  it('sesión inexistente → NotFoundException, sin consultar comensales', async () => {
    mockPrisma.sesionMesa.findUnique.mockResolvedValue(null)

    await expect(service.calcularPorConsumo('sesion-x')).rejects.toThrow(NotFoundException)

    expect(mockComensales.listarComensales).not.toHaveBeenCalled()
    expect(mockPrisma.pedidoItem.findMany).not.toHaveBeenCalled()
  })

  it('sin comensales registrados → BadRequestException', async () => {
    mockComensales.listarComensales.mockResolvedValue([])

    const promesa = service.calcularPorConsumo('sesion-1')

    await expect(promesa).rejects.toThrow(BadRequestException)
    await expect(promesa).rejects.toThrow('No hay comensales registrados en esta sesión')
    expect(mockPrisma.pedidoItem.findMany).not.toHaveBeenCalled()
  })

  it('un ítem etiquetado a un solo comensal se le asigna entero; los demás quedan en 0', async () => {
    mockPrisma.pedidoItem.findMany.mockResolvedValue([
      pedidoItem('pi-1', 'Milanesa', 500, 2, ['c-ana']),
    ])

    const r = await service.calcularPorConsumo('sesion-1')

    expect(r.partes).toEqual([
      { comensalId: 'c-ana', nombre: 'Ana', montoCentavos: 100000, monto: 1000 },
      { comensalId: 'c-beto', nombre: 'Beto', montoCentavos: 0, monto: 0 },
      { comensalId: 'c-carla', nombre: 'Carla', montoCentavos: 0, monto: 0 },
    ])
  })

  // Las partes esperadas van en el orden de las asignaciones (createdAt asc). Las asignaciones vienen al revés
  // que la lista de comensales, para que se vea que el resto sigue a la primera asignación y no al primer comensal.
  it.each([
    ['una sola parte', 100.01, 1, [10001]],
    ['resto 0', 90, 3, [3000, 3000, 3000]],
    ['resto 1 ($100,01 entre 2)', 100.01, 2, [5001, 5000]],
    ['resto 2 con 3 partes', 100.01, 3, [3335, 3333, 3333]],
    ['resto 4 con 5 partes', 100.04, 5, [2004, 2000, 2000, 2000, 2000]],
  ])('reparto de un ítem compartido, %s: el resto entero de centavos va a la primera asignación', async (_caso, total, cantidadPartes, esperadas) => {
    // Arrange
    const comensales = Array.from({ length: cantidadPartes }, (_, i) => ({ id: `c-${i + 1}`, nombre: `Comensal ${i + 1}` }))
    const asignados = comensales.map((c) => c.id).reverse()
    mockComensales.listarComensales.mockResolvedValue(comensales)
    mockPrisma.pedidoItem.findMany.mockResolvedValue([pedidoItem('pi-1', 'Pizza', total, 1, asignados)])

    // Act
    const r = await service.calcularPorConsumo('sesion-1')

    // Assert
    const obtenidas = asignados.map((id) => r.partes.find((p) => p.comensalId === id)?.montoCentavos)
    expect(obtenidas).toEqual(esperadas)
    expect(r.partes.reduce((acc, p) => acc + p.montoCentavos, 0)).toBe(Math.round(total * 100))
  })

  it('usa cantidadEditada cuando existe (precio 100, cantidad 3, editada 2 → 200)', async () => {
    mockPrisma.pedidoItem.findMany.mockResolvedValue([
      pedidoItem('pi-1', 'Cerveza', 100, 3, ['c-ana'], 2),
    ])

    const r = await service.calcularPorConsumo('sesion-1')

    expect(r.partes.find((p) => p.comensalId === 'c-ana')).toMatchObject({
      montoCentavos: 20000,
      monto: 200,
    })
  })

  it('los ítems sin etiquetas van a huérfanos y no suman a ningún comensal', async () => {
    mockPrisma.pedidoItem.findMany.mockResolvedValue([
      pedidoItem('pi-1', 'Milanesa', 500, 1, ['c-ana']), // etiquetado: 500 → 50000 centavos
      pedidoItem('pi-9', 'Flan', 300, 1, []), // huérfano: 300 → 30000 centavos
    ])

    const r = await service.calcularPorConsumo('sesion-1')

    // Solo lo etiquetado se reparte; el huérfano no suma a nadie.
    expect(r.partes).toEqual([
      { comensalId: 'c-ana', nombre: 'Ana', montoCentavos: 50000, monto: 500 },
      { comensalId: 'c-beto', nombre: 'Beto', montoCentavos: 0, monto: 0 },
      { comensalId: 'c-carla', nombre: 'Carla', montoCentavos: 0, monto: 0 },
    ])
    expect(r.huerfanos).toEqual({
      items: [{ pedidoItemId: 'pi-9', nombre: 'Flan', montoCentavos: 30000, monto: 300 }],
      totalCentavos: 30000,
      total: 300,
    })
  })

  it('excluye pedidos cancelados y pide las asignaciones ordenadas por createdAt', async () => {
    await service.calcularPorConsumo('sesion-1')

    expect(mockPrisma.pedidoItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pedido: { sesionId: 'sesion-1', estado: { not: 'cancelado' } } },
        include: expect.objectContaining({
          asignaciones: expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
        }),
      }),
    )
  })

  it('el resultado trae solo partes y huérfanos (sin campos de la división en partes iguales)', async () => {
    const r = await service.calcularPorConsumo('sesion-1')

    expect(Object.keys(r).sort()).toEqual(['huerfanos', 'partes'])
  })

  it('usa el cliente de la transacción cuando se le pasa uno', async () => {
    const tx = {
      sesionMesa: { findUnique: jest.fn().mockResolvedValue({ id: 'sesion-1' }) },
      pedidoItem: { findMany: jest.fn().mockResolvedValue([]) },
    }

    await service.calcularPorConsumo('sesion-1', tx as never)

    expect(tx.sesionMesa.findUnique).toHaveBeenCalled()
    expect(tx.pedidoItem.findMany).toHaveBeenCalled()
    expect(mockPrisma.sesionMesa.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.pedidoItem.findMany).not.toHaveBeenCalled()
    expect(mockComensales.listarComensales).toHaveBeenCalledWith('sesion-1', tx)
  })
})

// ── Saldo y total de la sesión ───────────────────────────────────────────────
// Son los que deciden cuánto se cobra. La "base" simulada filtra filas con el `where` que recibe (igualdad, `not`
// e `in`), así que qué pedidos y qué pagos cuentan lo decide la consulta del servicio, no el test.

type Fila = Record<string, unknown>
const cumple = (where: Fila) => (fila: Fila) =>
  Object.entries(where).every(([campo, condicion]) => {
    if (condicion && typeof condicion === 'object' && 'not' in condicion) return fila[campo] !== condicion.not
    if (condicion && typeof condicion === 'object' && 'in' in condicion) {
      return (condicion.in as unknown[]).includes(fila[campo])
    }
    return fila[campo] === condicion
  })

type ItemDePedido = { precioUnitario: unknown; cantidad: number; cantidadEditada?: number | null }
const pedido = (estado: string, items: ItemDePedido[]): Fila => ({
  sesionId: 'sesion-1',
  estado,
  items: items.map((i) => ({ cantidadEditada: null, ...i })),
})
const pago = (estado: string, monto: unknown): Fila => ({ sesionId: 'sesion-1', estado, monto })

describe('DivisionService.calcularTotalSesion', () => {
  let service: DivisionService
  const tx = { pedido: { findMany: jest.fn() } }

  function pedidosEnLaBase(pedidos: Fila[]) {
    tx.pedido.findMany.mockImplementation(({ where }: { where: Fila }) => Promise.resolve(pedidos.filter(cumple(where))))
  }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DivisionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ComensalesService, useValue: mockComensales },
      ],
    }).compile()

    service = module.get(DivisionService)
    jest.clearAllMocks()
  })

  it.each<[string, number, Fila[]]>([
    ['sin pedidos', 0, []],
    ['un pedido sin ítems', 0, [pedido('pendiente', [])]],
    ['precio por cantidad', 3000, [pedido('pendiente', [{ precioUnitario: 1500, cantidad: 2 }])]],
    [
      'cantidadEditada reemplaza a la cantidad',
      1000,
      [pedido('entregado', [{ precioUnitario: 1000, cantidad: 3, cantidadEditada: 1 }])],
    ],
    [
      'cantidadEditada 0 (ítem anulado) suma 0',
      0,
      [pedido('entregado', [{ precioUnitario: 1000, cantidad: 3, cantidadEditada: 0 }])],
    ],
    [
      'varios pedidos e ítems se suman',
      6400,
      [
        pedido('pendiente', [{ precioUnitario: 1500, cantidad: 2 }, { precioUnitario: 800, cantidad: 1 }]),
        pedido('listo', [{ precioUnitario: 2600, cantidad: 1 }]),
      ],
    ],
    [
      'el precio como Decimal de Prisma',
      2469,
      [pedido('pendiente', [{ precioUnitario: new Prisma.Decimal('1234.50'), cantidad: 2 }])],
    ],
  ])('%s → %d', async (_caso, esperado, pedidos) => {
    // Arrange
    pedidosEnLaBase(pedidos)

    // Act
    const total = await service.calcularTotalSesion(tx as never, 'sesion-1')

    // Assert
    expect(total).toBe(esperado)
  })

  it('no suma los pedidos cancelados', async () => {
    // Arrange
    pedidosEnLaBase([
      pedido('pendiente', [{ precioUnitario: 1000, cantidad: 1 }]),
      pedido('cancelado', [{ precioUnitario: 5000, cantidad: 2 }]),
    ])

    // Act
    const total = await service.calcularTotalSesion(tx as never, 'sesion-1')

    // Assert
    expect(total).toBe(1000)
  })

  it('suma los centavos sin perderlos (a dos decimales)', async () => {
    // Arrange
    pedidosEnLaBase([pedido('pendiente', [{ precioUnitario: 100.1, cantidad: 1 }, { precioUnitario: 200.2, cantidad: 1 }])])

    // Act
    const total = await service.calcularTotalSesion(tx as never, 'sesion-1')

    // Assert
    expect(total).toBeCloseTo(300.3, 2)
  })

  it('usa el precio guardado en cada ítem del pedido: no consulta el menú ni sus descuentos', async () => {
    // Arrange
    pedidosEnLaBase([])

    // Act
    await service.calcularTotalSesion(tx as never, 'sesion-1')

    // Assert
    expect(tx.pedido.findMany).toHaveBeenCalledWith({
      where: { sesionId: 'sesion-1', estado: { not: 'cancelado' } },
      include: { items: { select: { cantidad: true, cantidadEditada: true, precioUnitario: true } } },
    })
  })

  it('consulta con el cliente que recibe (la transacción), no con PrismaService', async () => {
    // Arrange
    pedidosEnLaBase([])

    // Act
    await service.calcularTotalSesion(tx as never, 'sesion-1')

    // Assert
    expect(tx.pedido.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled()
  })
})

describe('DivisionService.obtenerSaldo', () => {
  let service: DivisionService

  function enLaBase({ pedidos = [], pagos = [] }: { pedidos?: Fila[]; pagos?: Fila[] }) {
    mockPrisma.pedido.findMany.mockImplementation(({ where }: { where: Fila }) => Promise.resolve(pedidos.filter(cumple(where))))
    mockPrisma.pago.findMany.mockImplementation(({ where }: { where: Fila }) => Promise.resolve(pagos.filter(cumple(where))))
  }
  const consumoDe1000 = [pedido('entregado', [{ precioUnitario: 1000, cantidad: 1 }])]

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DivisionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ComensalesService, useValue: mockComensales },
      ],
    }).compile()

    service = module.get(DivisionService)
    jest.clearAllMocks()
    mockPrisma.sesionMesa.findUnique.mockResolvedValue({ id: 'sesion-1', estado: 'activa' })
  })

  it('sesión inexistente → NotFoundException, sin consultar pedidos ni pagos', async () => {
    // Arrange
    mockPrisma.sesionMesa.findUnique.mockResolvedValue(null)

    // Act
    const saldo = service.obtenerSaldo('sesion-x')

    // Assert
    await expect(saldo).rejects.toThrow(NotFoundException)
    await expect(saldo).rejects.toThrow('Sesión no encontrada')
    expect(mockPrisma.pedido.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.pago.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ['aprobado', 400, 600],
    ['pendiente', 0, 1000],
    ['rechazado', 0, 1000],
    ['cancelado', 0, 1000],
  ])('un pago %s de $400 sobre $1000 → cobrado %d, saldo %d', async (estado, cobrado, saldo) => {
    // Arrange
    enLaBase({ pedidos: consumoDe1000, pagos: [pago(estado, 400)] })

    // Act
    const resultado = await service.obtenerSaldo('sesion-1')

    // Assert
    expect(resultado).toEqual({ totalSesion: 1000, totalCobrado: cobrado, saldoPendiente: saldo })
  })

  it('varios pagos aprobados se suman (también como Decimal) y el saldo es lo que falta', async () => {
    // Arrange
    enLaBase({
      pedidos: consumoDe1000,
      pagos: [pago('aprobado', new Prisma.Decimal('250.50')), pago('aprobado', 300), pago('pendiente', 449.5)],
    })

    // Act
    const resultado = await service.obtenerSaldo('sesion-1')

    // Assert
    expect(resultado).toEqual({ totalSesion: 1000, totalCobrado: 550.5, saldoPendiente: 449.5 })
  })

  it('un sobrepago deja el saldo en 0, nunca negativo', async () => {
    // Arrange
    enLaBase({ pedidos: consumoDe1000, pagos: [pago('aprobado', 700), pago('aprobado', 500)] })

    // Act
    const resultado = await service.obtenerSaldo('sesion-1')

    // Assert
    expect(resultado).toEqual({ totalSesion: 1000, totalCobrado: 1200, saldoPendiente: 0 })
  })

  it('una sesión sin pedidos tiene total 0 y saldo 0', async () => {
    // Arrange
    enLaBase({})

    // Act
    const resultado = await service.obtenerSaldo('sesion-1')

    // Assert
    expect(resultado).toEqual({ totalSesion: 0, totalCobrado: 0, saldoPendiente: 0 })
  })

  it('no mira el estado de la sesión: una sesión cerrada también da su saldo', async () => {
    // Arrange
    mockPrisma.sesionMesa.findUnique.mockResolvedValue({ id: 'sesion-1', estado: 'cerrada' })
    enLaBase({ pedidos: consumoDe1000, pagos: [pago('aprobado', 1000)] })

    // Act
    const resultado = await service.obtenerSaldo('sesion-1')

    // Assert
    expect(resultado).toEqual({ totalSesion: 1000, totalCobrado: 1000, saldoPendiente: 0 })
  })
})
