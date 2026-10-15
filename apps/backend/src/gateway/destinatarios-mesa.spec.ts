import { destinatariosDeMesa } from './destinatarios-mesa'

const prisma = {
  mesa: { findUnique: jest.fn() },
  mozo: { findMany: jest.fn() },
}

describe('destinatariosDeMesa', () => {
  beforeEach(() => jest.clearAllMocks())

  it('mesa con mozos activos asignados → solo esos, sin consultar al resto', async () => {
    prisma.mesa.findUnique.mockResolvedValue({
      restauranteId: 'rest-1',
      mozoMesas: [{ mozoId: 'mozo-a' }, { mozoId: 'mozo-b' }],
    })

    await expect(destinatariosDeMesa(prisma as never, 'mesa-1')).resolves.toEqual(['mozo-a', 'mozo-b'])
    expect(prisma.mozo.findMany).not.toHaveBeenCalled()
  })

  it('pide solo asignaciones de mozos activos', async () => {
    prisma.mesa.findUnique.mockResolvedValue({ restauranteId: 'rest-1', mozoMesas: [{ mozoId: 'mozo-a' }] })

    await destinatariosDeMesa(prisma as never, 'mesa-1')

    expect(prisma.mesa.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mesa-1' },
        select: expect.objectContaining({
          mozoMesas: expect.objectContaining({ where: { mozo: { activo: true } } }),
        }),
      }),
    )
  })

  it('mesa sin mozo asignado → todos los mozos activos del restaurante', async () => {
    prisma.mesa.findUnique.mockResolvedValue({ restauranteId: 'rest-1', mozoMesas: [] })
    prisma.mozo.findMany.mockResolvedValue([{ id: 'mozo-a' }, { id: 'mozo-c' }])

    await expect(destinatariosDeMesa(prisma as never, 'mesa-1')).resolves.toEqual(['mozo-a', 'mozo-c'])
    expect(prisma.mozo.findMany).toHaveBeenCalledWith({
      where: { restauranteId: 'rest-1', activo: true },
      select: { id: true },
    })
  })

  it('mozos asignados dados de baja (el filtro los deja afuera) → respaldo a todos los activos', async () => {
    prisma.mesa.findUnique.mockResolvedValue({ restauranteId: 'rest-1', mozoMesas: [] })
    prisma.mozo.findMany.mockResolvedValue([{ id: 'mozo-d' }])

    await expect(destinatariosDeMesa(prisma as never, 'mesa-1')).resolves.toEqual(['mozo-d'])
  })

  it('restaurante sin mozos activos → []', async () => {
    prisma.mesa.findUnique.mockResolvedValue({ restauranteId: 'rest-1', mozoMesas: [] })
    prisma.mozo.findMany.mockResolvedValue([])

    await expect(destinatariosDeMesa(prisma as never, 'mesa-1')).resolves.toEqual([])
  })

  it('mesa inexistente → [] sin consultar mozos', async () => {
    prisma.mesa.findUnique.mockResolvedValue(null)

    await expect(destinatariosDeMesa(prisma as never, 'nada')).resolves.toEqual([])
    expect(prisma.mozo.findMany).not.toHaveBeenCalled()
  })
})
