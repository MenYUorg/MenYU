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

const RESTAURANTE = {
  id: 'rest-1',
  nombre: 'Restaurante Test',
  activo: true,
  nombreSeccionRecomendados: 'Recomendaciones del chef',
  direccion: 'Av. Siempreviva 742',
  logoUrl: null,
  marca: { logoUrl: null, activo: true },
}

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
        direccion: 'Av. Siempreviva 742',
        logoUrl: null,
      })
      expect(result.categorias).toEqual([])
    })

    describe('logo y dirección del restaurante (para el header y el menú lateral)', () => {
      it('con logo propio devuelve ese, aunque la marca tenga otro', async () => {
        mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, logoUrl: 'https://x/propio.png', marca: { logoUrl: 'https://x/marca.png', activo: true } })

        const result = await service.getMenuPublico('rest-1', {})

        expect(result.restaurante.logoUrl).toBe('https://x/propio.png')
      })

      it('sin logo propio devuelve el de su marca', async () => {
        mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, logoUrl: null, marca: { logoUrl: 'https://x/marca.png', activo: true } })

        const result = await service.getMenuPublico('rest-1', {})

        expect(result.restaurante.logoUrl).toBe('https://x/marca.png')
      })

      it('sin logo propio ni de marca devuelve null (la app muestra el de MenYU)', async () => {
        mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, logoUrl: null, marca: { logoUrl: null, activo: true } })

        const result = await service.getMenuPublico('rest-1', {})

        expect(result.restaurante.logoUrl).toBeNull()
      })

      it('una marca sin logo cargado no rompe: devuelve null', async () => {
        mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, marca: { activo: true } })

        const result = await service.getMenuPublico('rest-1', {})

        expect(result.restaurante.logoUrl).toBeNull()
      })

      it('devuelve la dirección tal cual y null si no está cargada', async () => {
        expect((await service.getMenuPublico('rest-1', {})).restaurante.direccion).toBe('Av. Siempreviva 742')

        mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, direccion: null })

        expect((await service.getMenuPublico('rest-1', {})).restaurante.direccion).toBeNull()
      })

      it('pide a la base solo lo necesario del restaurante y de su marca (sin datos sensibles)', async () => {
        await service.getMenuPublico('rest-1', {})

        expect(mockPrisma.restaurante.findUnique).toHaveBeenCalledWith({
          where: { id: 'rest-1' },
          select: {
            id: true,
            nombre: true,
            activo: true,
            nombreSeccionRecomendados: true,
            direccion: true,
            logoUrl: true,
            marca: { select: { logoUrl: true, activo: true } },
          },
        })
      })
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

    it('marca dada de baja (con el restaurante activo) → lanza NotFoundException y no busca el menú', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, activo: true, marca: { logoUrl: null, activo: false } })

      await expect(service.getMenuPublico('rest-1', {})).rejects.toThrow('Restaurante no encontrado')

      expect(mockPrisma.categoriaMenu.findMany).not.toHaveBeenCalled()
    })

    it('marca y restaurante activos → devuelve el menú (reactivar vuelve todo como estaba)', async () => {
      mockPrisma.restaurante.findUnique.mockResolvedValue({ ...RESTAURANTE, activo: true, marca: { logoUrl: null, activo: true } })

      await expect(service.getMenuPublico('rest-1', {})).resolves.toMatchObject({ restaurante: { id: 'rest-1' } })
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

  // ── Descuentos ────────────────────────────────────────────────────────────────

  describe('getMenuPublico — descuentos', () => {
    const ITEM_CON_DESCUENTO = { ...ITEM_BASE, id: 'item-desc', nombre: 'Milanesa en oferta', precioBase: 2000, precioDescuento: 1500 }

    // La primera consulta de ítems es la de recomendados y la segunda, la de descuentos.
    function mockearItems(recomendados: unknown[], descuentos: unknown[]) {
      mockPrisma.itemMenu.findMany.mockResolvedValueOnce(recomendados).mockResolvedValueOnce(descuentos)
    }

    it('sin ítems en descuento → descuentos: []', async () => {
      const result = await service.getMenuPublico('rest-1', {})

      expect(result.descuentos).toEqual([])
    })

    it('un ítem en descuento aparece en descuentos con precio, porcentaje y precio vigente (números)', async () => {
      mockearItems([], [ITEM_CON_DESCUENTO])

      const result = await service.getMenuPublico('rest-1', {})

      expect(result.descuentos).toHaveLength(1)
      expect(result.descuentos[0]).toMatchObject({
        id: 'item-desc',
        precioBase: 2000,
        precioDescuento: 1500,
        porcentajeDescuento: 25,
        precioVigente: 1500,
      })
      expect(typeof result.descuentos[0].precioDescuento).toBe('number')
      expect(typeof result.descuentos[0].porcentajeDescuento).toBe('number')
      expect(typeof result.descuentos[0].precioVigente).toBe('number')
    })

    it('la consulta pide solo ítems disponibles de ese restaurante y con descuento', async () => {
      await service.getMenuPublico('rest-1', {})

      const consultaDescuentos = mockPrisma.itemMenu.findMany.mock.calls[1][0] as any
      expect(consultaDescuentos.where).toEqual({
        restauranteId: 'rest-1',
        disponible: true,
        precioDescuento: { not: null },
      })
    })

    it('buscar por nombre también filtra los descuentos', async () => {
      await service.getMenuPublico('rest-1', { buscar: 'milanesa' })

      const consultaDescuentos = mockPrisma.itemMenu.findMany.mock.calls[1][0] as any
      expect(consultaDescuentos.where.nombre).toEqual({ contains: 'milanesa', mode: 'insensitive' })
    })

    it('los filtros de dieta y alérgenos se aplican también a los descuentos', async () => {
      const vegano = { ...ITEM_CON_DESCUENTO, id: 'desc-vegano', clasificaciones: ITEM_VEGANO.clasificaciones }
      const noVegano = { ...ITEM_CON_DESCUENTO, id: 'desc-no-vegano' }
      const conAlergeno = {
        ...ITEM_CON_DESCUENTO,
        id: 'desc-alergeno',
        ingredientes: [{ ...ING_REMOVIBLE, ingrediente: { id: 'ing-m', nombre: 'Maní', esAlergeno: true } }],
      }

      mockearItems([], [vegano, noVegano])
      const porDieta = await service.getMenuPublico('rest-1', { dieta: ['VEGANO'] })
      expect(porDieta.descuentos.map((i) => i.id)).toEqual(['desc-vegano'])

      mockearItems([], [noVegano, conAlergeno])
      const sinAlergenos = await service.getMenuPublico('rest-1', { evitarAlergenos: true })
      expect(sinAlergenos.descuentos.map((i) => i.id)).toEqual(['desc-no-vegano'])
    })

    it('se ordenan como los recomendados: por el orden de la categoría y después por nombre; sin categoría al final', async () => {
      const deCategoria2 = { ...ITEM_CON_DESCUENTO, id: 'c2', nombre: 'A', categoria: { orden: 2 } }
      const deCategoria1Z = { ...ITEM_CON_DESCUENTO, id: 'c1z', nombre: 'Z', categoria: { orden: 1 } }
      const deCategoria1A = { ...ITEM_CON_DESCUENTO, id: 'c1a', nombre: 'B', categoria: { orden: 1 } }
      const sinCategoria = { ...ITEM_CON_DESCUENTO, id: 'sin', nombre: 'A', categoria: null }
      mockearItems([], [sinCategoria, deCategoria2, deCategoria1Z, deCategoria1A])

      const result = await service.getMenuPublico('rest-1', {})

      expect(result.descuentos.map((i) => i.id)).toEqual(['c1a', 'c1z', 'c2', 'sin'])
    })

    it('un ítem sin descuento guardado no aparece aunque la consulta lo devuelva', async () => {
      mockearItems([], [ITEM_BASE, { ...ITEM_BASE, id: 'otro', precioDescuento: null }])

      const result = await service.getMenuPublico('rest-1', {})

      expect(result.descuentos).toEqual([])
    })

    it('un descuento que no es válido contra el precio base no se muestra y se cobra el base', async () => {
      mockearItems([], [{ ...ITEM_CON_DESCUENTO, precioDescuento: 2000 }])

      const result = await service.getMenuPublico('rest-1', {})

      expect(result.descuentos[0]).toMatchObject({ precioDescuento: null, porcentajeDescuento: null, precioVigente: 2000 })
    })

    it('los ítems de las categorías y los recomendados también traen los campos de descuento', async () => {
      mockPrisma.categoriaMenu.findMany.mockResolvedValue([
        makeCategoria({ items: [ITEM_CON_DESCUENTO, ITEM_BASE] }),
      ])
      mockearItems([ITEM_CON_DESCUENTO], [ITEM_CON_DESCUENTO])

      const result = await service.getMenuPublico('rest-1', {})

      const [conDescuento, sinDescuento] = result.categorias[0].itemsDirectos
      expect(conDescuento).toMatchObject({ precioBase: 2000, precioDescuento: 1500, porcentajeDescuento: 25, precioVigente: 1500 })
      expect(sinDescuento).toMatchObject({ precioBase: 1500, precioDescuento: null, porcentajeDescuento: null, precioVigente: 1500 })
      expect(result.recomendados[0]).toMatchObject({ precioDescuento: 1500, precioVigente: 1500, esRecomendado: true })
    })

    it('los recomendados siguen igual que antes (misma consulta y mismo orden)', async () => {
      await service.getMenuPublico('rest-1', {})

      const consultaRecomendados = mockPrisma.itemMenu.findMany.mock.calls[0][0] as any
      expect(consultaRecomendados.where).toEqual({
        restauranteId: 'rest-1',
        disponible: true,
        recomendadoEn: { not: null },
      })
    })
  })
})
