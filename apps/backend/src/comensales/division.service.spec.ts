import { Test } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DivisionService } from './division.service'
import { ComensalesService } from './comensales.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPrisma = {
  sesionMesa: { findUnique: jest.fn() },
  pedidoItem: { findMany: jest.fn() },
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

  it('un ítem compartido se divide entre sus etiquetados y el resto de centavos va al primero', async () => {
    // $100.01 entre Ana y Beto = 10001 centavos → 5000 cada uno, el centavo sobrante a Ana.
    mockPrisma.pedidoItem.findMany.mockResolvedValue([
      pedidoItem('pi-1', 'Pizza', 100.01, 1, ['c-ana', 'c-beto']),
    ])

    const r = await service.calcularPorConsumo('sesion-1')

    expect(r.partes.find((p) => p.comensalId === 'c-ana')).toMatchObject({
      montoCentavos: 5001,
      monto: 50.01,
    })
    expect(r.partes.find((p) => p.comensalId === 'c-beto')).toMatchObject({
      montoCentavos: 5000,
      monto: 50,
    })
    expect(r.partes.find((p) => p.comensalId === 'c-carla')).toMatchObject({ montoCentavos: 0 })
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
