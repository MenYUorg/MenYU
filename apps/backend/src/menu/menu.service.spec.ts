import { Test } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { MenuService } from './menu.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPrisma = {
  restaurante: {
    findUnique: jest.fn(),
  },
  categoriaMenu: {
    findMany: jest.fn(),
  },
  itemMenu: {
    findMany: jest.fn(),
  },
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RESTAURANTE = { id: 'rest-1', nombre: 'Restaurante Test', activo: true, nombreSeccionRecomendados: 'Recomendaciones del chef' }

const ING_REMOVIBLE = {
  id: 'ii-pan',
  ingredienteId: 'ing-pan',
  esOriginal: true,
  cantidad: 1,
  esRemovible: true,
  esAgregable: false,
  precioExtra: 0,
  cantidadMin: 0,
  cantidadMax: 1,
  ingrediente: { id: 'ing-pan', nombre: 'Pan', esAlergeno: false },
}

const ING_AGREGABLE = {
  id: 'ii-queso',
  ingredienteId: 'ing-queso',
  esOriginal: false,
  cantidad: 0,
  esRemovible: false,
  esAgregable: true,
  precioExtra: 150,
  cantidadMin: 0,
  cantidadMax: 3,
  ingrediente: { id: 'ing-queso', nombre: 'Queso extra', esAlergeno: false },
}

const ITEM_BASE = {
  id: 'item-1',
  nombre: 'Milanesa napolitana',
  descripcion: 'Con salsa y queso',
  precioBase: 1500,
  disponible: true,
  imagenUrl: 'https://storage/milanesa.jpg',
  ingredientes: [],
  clasificaciones: [],
}

const ITEM_VEGANO = {
  ...ITEM_BASE,
  id: 'item-vegano',
  nombre: 'Ensalada vegana',
  clasificaciones: [{ clasificacion: { id: 'clasif-1', nombre: 'VEGANO' } }],
}

const ITEM_NO_VEGANO = {
  ...ITEM_BASE,
  id: 'item-no-vegano',
  nombre: 'Asado',
  clasificaciones: [],
}

const ITEM_CON_INGREDIENTES = {
  ...ITEM_BASE,
  id: 'item-hamburguesa',
  nombre: 'Hamburguesa completa',
  precioBase: 2500,
  ingredientes: [ING_REMOVIBLE, ING_AGREGABLE],
}

function makeCategoria(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    nombre: 'Principales',
    orden: 1,
    items: [],
    ...overrides,
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MenuService', () => {
  let service: MenuService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MenuService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(MenuService)
    jest.clearAllMocks()
    mockPrisma.restaurante.findUnique.mockResolvedValue(RESTAURANTE)
    mockPrisma.categoriaMenu.findMany.mockResolvedValue([])
    mockPrisma.itemMenu.findMany.mockResolvedValue([])
  })

  // ── getMenuPublico ─────────────────────────────────────────────────────────

  describe('getMenuPublico', () => {

    // 1. Restaurante sin categorías
    it('restaurante sin categorías → devuelve restaurante + categorías: []', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([])

      const result = await service.getMenuPublico('rest-1', {})

      expect(result.restaurante).toEqual({
        id: 'rest-1',
        nombre: 'Restaurante Test',
        nombreSeccionRecomendados: 'Recomendaciones del chef',
      })
      expect(result.categorias).toEqual([])
    })

    // 2. Todos los ítems de una categoría aparecen en itemsDirectos
    it('categoría con ítems → aparecen en itemsDirectos', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [ITEM_BASE] }),
      ])

      const result = await service.getMenuPublico('rest-1', {})

      expect(result.categorias).toHaveLength(1)
      expect(result.categorias[0].itemsDirectos).toHaveLength(1)
      expect(result.categorias[0].itemsDirectos[0].id).toBe('item-1')
      expect(result.categorias[0].itemsDirectos[0].nombre).toBe('Milanesa napolitana')
    })

    // 3. Ítem disponible:false — Prisma filtra en la query; categoría queda vacía y se excluye
    it('categoría sin ítems disponibles → queda excluida del resultado', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [] }),
      ])

      const result = await service.getMenuPublico('rest-1', {})

      expect(result.categorias).toHaveLength(0)
    })

    it('la query a Prisma siempre incluye disponible:true en el where de ítems', async () => {
      await service.getMenuPublico('rest-1', {})

      expect(mockPrisma.categoriaMenu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            items: expect.objectContaining({
              where: expect.objectContaining({ disponible: true }),
            }),
          }),
        }),
      )
    })

    // 4. Filtro ?dieta=VEGANO
    it('filtro dieta:VEGANO → solo pasan ítems con esa clasificación (filtro en memoria)', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [ITEM_VEGANO, ITEM_NO_VEGANO] }),
      ])

      const result = await service.getMenuPublico('rest-1', { dieta: ['VEGANO'] })

      expect(result.categorias[0].itemsDirectos).toHaveLength(1)
      expect(result.categorias[0].itemsDirectos[0].id).toBe('item-vegano')
    })

    it('filtro dieta:VEGANO — categoría sin ítems que pasen queda excluida', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [ITEM_NO_VEGANO] }),
      ])

      const result = await service.getMenuPublico('rest-1', { dieta: ['VEGANO'] })

      expect(result.categorias).toHaveLength(0)
    })

    it('filtro dieta es case-insensitive → "vegano" matchea clasificación "VEGANO"', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [ITEM_VEGANO] }),
      ])

      const result = await service.getMenuPublico('rest-1', { dieta: ['vegano'] })

      expect(result.categorias[0].itemsDirectos[0].id).toBe('item-vegano')
    })

    // 5. Filtro ?buscar=milanesa
    it('filtro buscar → categoriaMenu.findMany recibe contains + insensitive en ítems', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [ITEM_BASE] }),
      ])

      await service.getMenuPublico('rest-1', { buscar: 'milanesa' })

      expect(mockPrisma.categoriaMenu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            items: expect.objectContaining({
              where: expect.objectContaining({
                nombre: { contains: 'milanesa', mode: 'insensitive' },
              }),
            }),
          }),
        }),
      )
    })

    it('sin filtro buscar → la query no incluye filtro por nombre', async () => {
      await service.getMenuPublico('rest-1', {})

      const call = mockPrisma.categoriaMenu.findMany.mock.calls[0][0] as any
      expect(call.include.items.where).not.toHaveProperty('nombre')
    })

    // 6. Filtro ?categoria=uuid
    it('filtro categoriaId → categoriaMenu.findMany recibe id en el where', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ id: 'cat-especifica', items: [ITEM_BASE] }),
      ])

      await service.getMenuPublico('rest-1', { categoriaId: 'cat-especifica' })

      expect(mockPrisma.categoriaMenu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            restauranteId: 'rest-1',
            id: 'cat-especifica',
          }),
        }),
      )
    })

    it('sin filtro categoriaId → el where solo contiene restauranteId', async () => {
      await service.getMenuPublico('rest-1', {})

      expect(mockPrisma.categoriaMenu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restauranteId: 'rest-1' },
        }),
      )
    })

    // 7. Restaurante inexistente / inactivo
    it('restaurante inexistente → lanza NotFoundException', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue(null)

      await expect(service.getMenuPublico('no-existe', {}))
        .rejects.toThrow(NotFoundException)
    })

    it('restaurante inactivo → lanza NotFoundException', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, activo: false })

      await expect(service.getMenuPublico('rest-inactivo', {}))
        .rejects.toThrow(NotFoundException)
    })

    // 8. Ingredientes con esAgregable, esRemovible, precioExtra
    it('ítem con ingredientes removibles y agregables → serializa todos los campos correctamente', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [ITEM_CON_INGREDIENTES] }),
      ])

      const result = await service.getMenuPublico('rest-1', {})
      const item = result.categorias[0].itemsDirectos[0]

      expect(item.ingredientes).toHaveLength(2)

      const removible = item.ingredientes.find((ii: any) => ii.esRemovible)
      expect(removible).toMatchObject({
        id: 'ii-pan',
        ingredienteId: 'ing-pan',
        esOriginal: true,
        esRemovible: true,
        esAgregable: false,
        precioExtra: 0,
        cantidadMin: 0,
        cantidadMax: 1,
        ingrediente: { id: 'ing-pan', nombre: 'Pan', esAlergeno: false },
      })

      const agregable = item.ingredientes.find((ii: any) => ii.esAgregable)
      expect(agregable).toMatchObject({
        id: 'ii-queso',
        ingredienteId: 'ing-queso',
        esOriginal: false,
        esRemovible: false,
        esAgregable: true,
        precioExtra: 150,
        cantidadMin: 0,
        cantidadMax: 3,
        ingrediente: { id: 'ing-queso', nombre: 'Queso extra', esAlergeno: false },
      })
    })

    it('ítem con ingredientes — precioBase y precioExtra son number en el resultado', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [ITEM_CON_INGREDIENTES] }),
      ])

      const result = await service.getMenuPublico('rest-1', {})
      const item = result.categorias[0].itemsDirectos[0]

      expect(typeof item.precioBase).toBe('number')
      expect(typeof item.ingredientes[0].precioExtra).toBe('number')
      expect(typeof item.ingredientes[0].cantidad).toBe('number')
    })
  })
})
