import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { DiscoveryService, escaparLike, MAX_OFERTAS, MAX_RESTAURANTES } from './discovery.service'

const mockPrisma = {
  restaurante: { findMany: jest.fn() },
  itemMenu: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MARCA = { id: 'marca-1', nombre: 'Burger Lab', logoUrl: 'https://storage/marca.png' }

function restaurante(parcial: Record<string, unknown> = {}) {
  return {
    id: 'rest-1',
    nombre: 'Burger Lab Palermo',
    direccion: 'Honduras 5100, Palermo',
    logoUrl: 'https://storage/restaurante.png',
    marca: MARCA,
    _count: { items: 2 },
    ...parcial,
  }
}

function item(parcial: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    nombre: 'Milanesa napolitana',
    imagenUrl: 'https://storage/milanesa.jpg',
    precioBase: new Prisma.Decimal('4200.00'),
    precioDescuento: 3360,
    restaurante: { id: 'rest-1', nombre: 'Burger Lab Palermo' },
    ...parcial,
  }
}

// ── Ayudas ────────────────────────────────────────────────────────────────────

/** El SQL de una llamada a $queryRaw (las partes fijas de la plantilla, en una línea) y los valores que le pasó. */
function consulta(llamada: unknown[]): { sql: string; valores: unknown[] } {
  const [partes, ...valores] = llamada as [TemplateStringsArray, ...unknown[]]
  return { sql: partes.join('?').replace(/\s+/g, ' ').trim(), valores }
}

/**
 * Las tres consultas de la búsqueda, por lo que contiene su SQL. Los restaurantes con platos son los únicos que
 * tienen un EXISTS (de los platos que coinciden).
 */
function consultasDeBusqueda() {
  const todas = mockPrisma.$queryRaw.mock.calls.map(consulta)
  return {
    ofertas: todas.find((c) => c.sql.includes('FROM item_menu i') && c.sql.includes('precio_descuento IS NOT NULL'))!,
    restaurantes: todas.find((c) => c.sql.includes('FROM restaurante r') && !c.sql.includes('EXISTS'))!,
    conPlatos: todas.find((c) => c.sql.includes('EXISTS'))!,
  }
}

/** Qué devuelve cada una de las consultas de ids. */
function responderConsultas(filas: {
  ofertas?: unknown[]
  restaurantes?: unknown[]
  conPlatos?: unknown[]
}) {
  mockPrisma.$queryRaw.mockImplementation((partes: TemplateStringsArray) => {
    const sql = partes.join('?')
    if (sql.includes('EXISTS')) return Promise.resolve(filas.conPlatos ?? [])
    if (sql.includes('FROM item_menu i') && sql.includes('precio_descuento IS NOT NULL')) {
      return Promise.resolve(filas.ofertas ?? [])
    }
    return Promise.resolve(filas.restaurantes ?? [])
  })
}

describe('DiscoveryService', () => {
  let service: DiscoveryService

  beforeEach(async () => {
    jest.clearAllMocks()
    mockPrisma.restaurante.findMany.mockResolvedValue([])
    mockPrisma.itemMenu.findMany.mockResolvedValue([])
    responderConsultas({})

    const moduleRef = await Test.createTestingModule({
      providers: [DiscoveryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile()
    service = moduleRef.get(DiscoveryService)
  })

  // ── GET /discovery ──────────────────────────────────────────────────────────

  describe('getDiscovery', () => {
    it('arma los restaurantes con dirección, marca y cantidad de ofertas', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([restaurante()])

      const { restaurantes } = await service.getDiscovery()

      expect(restaurantes).toEqual([
        {
          id: 'rest-1',
          nombre: 'Burger Lab Palermo',
          direccion: 'Honduras 5100, Palermo',
          logoUrl: 'https://storage/restaurante.png',
          marca: { id: 'marca-1', nombre: 'Burger Lab' },
          cantidadOfertas: 2,
        },
      ])
    })

    it('el logo es el del restaurante y, si no tiene, el de su marca', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([
        restaurante({ id: 'a', logoUrl: 'https://storage/propio.png' }),
        restaurante({ id: 'b', logoUrl: null }),
      ])

      const { restaurantes } = await service.getDiscovery()

      expect(restaurantes.map((r) => r.logoUrl)).toEqual(['https://storage/propio.png', 'https://storage/marca.png'])
    })

    it('si ni el restaurante ni la marca tienen logo, el logo es null', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([
        restaurante({ logoUrl: null, marca: { ...MARCA, logoUrl: null } }),
      ])

      const { restaurantes } = await service.getDiscovery()

      expect(restaurantes[0].logoUrl).toBeNull()
    })

    it('un restaurante sin dirección cargada devuelve direccion null', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ direccion: null })])

      const { restaurantes } = await service.getDiscovery()

      expect(restaurantes[0].direccion).toBeNull()
    })

    it('pide solo restaurantes activos de marcas activas, por nombre y con el tope de 50', async () => {
      await service.getDiscovery()

      const pedido = mockPrisma.restaurante.findMany.mock.calls[0][0]
      expect(pedido.where).toEqual({ activo: true, marca: { activo: true } })
      expect(pedido.orderBy).toEqual([{ nombre: 'asc' }, { id: 'asc' }])
      expect(pedido.take).toBe(MAX_RESTAURANTES)
      expect(MAX_RESTAURANTES).toBe(50)
    })

    it('la cantidad de ofertas cuenta solo platos disponibles con descuento', async () => {
      await service.getDiscovery()

      const { select } = mockPrisma.restaurante.findMany.mock.calls[0][0]
      expect(select._count).toEqual({
        select: { items: { where: { disponible: true, precioDescuento: { not: null } } } },
      })
    })

    it('el select es explícito y no trae datos sensibles del restaurante', async () => {
      await service.getDiscovery()

      const { select } = mockPrisma.restaurante.findMany.mock.calls[0][0]
      expect(Object.keys(select).sort()).toEqual(['_count', 'direccion', 'id', 'logoUrl', 'marca', 'nombre'])
      expect(Object.keys(select.marca.select).sort()).toEqual(['id', 'logoUrl', 'nombre'])
      const serializado = JSON.stringify(select)
      for (const sensible of ['mpAccessToken', 'mpRefreshToken', 'mpUserId', 'mpTokenExpiresAt', 'modoSesion']) {
        expect(serializado).not.toContain(sensible)
      }
    })

    it('el listado no usa unaccent (anda aunque la extensión no esté)', async () => {
      await service.getDiscovery()

      const consultas = mockPrisma.$queryRaw.mock.calls.map(consulta)
      expect(consultas).toHaveLength(1)
      expect(consultas[0].sql).not.toContain('unaccent')
    })

    describe('ofertas', () => {
      it('la consulta pide solo platos disponibles en descuento de restaurantes y marcas activos, con tope de 30', async () => {
        await service.getDiscovery()

        const { sql, valores } = consulta(mockPrisma.$queryRaw.mock.calls[0])
        expect(sql).toContain('i.disponible = true')
        expect(sql).toContain('i.precio_descuento IS NOT NULL')
        expect(sql).toContain('r.activo = true')
        expect(sql).toContain('m.activo = true')
        expect(sql).toContain('ORDER BY (i.precio_base - i.precio_descuento) / i.precio_base DESC')
        expect(valores).toEqual([MAX_OFERTAS])
        expect(MAX_OFERTAS).toBe(30)
      })

      it('salen en el orden que devuelve la base (porcentaje mayor), no en el de los ítems', async () => {
        responderConsultas({ ofertas: [{ id: 'item-b' }, { id: 'item-a' }] })
        mockPrisma.itemMenu.findMany.mockResolvedValue([
          item({ id: 'item-a', nombre: 'A', precioBase: new Prisma.Decimal('1000'), precioDescuento: 900 }),
          item({ id: 'item-b', nombre: 'B', precioBase: new Prisma.Decimal('1000'), precioDescuento: 500 }),
        ])

        const { ofertas } = await service.getDiscovery()

        expect(ofertas.map((o) => o.id)).toEqual(['item-b', 'item-a'])
      })

      it('traen los precios y el porcentaje ya calculados, como números', async () => {
        responderConsultas({ ofertas: [{ id: 'item-1' }] })
        mockPrisma.itemMenu.findMany.mockResolvedValue([item()])

        const { ofertas } = await service.getDiscovery()

        expect(ofertas).toEqual([
          {
            id: 'item-1',
            nombre: 'Milanesa napolitana',
            imagenUrl: 'https://storage/milanesa.jpg',
            precioBase: 4200,
            precioDescuento: 3360,
            porcentajeDescuento: 20,
            precioVigente: 3360,
            restaurante: { id: 'rest-1', nombre: 'Burger Lab Palermo' },
          },
        ])
        expect(typeof ofertas[0].precioBase).toBe('number')
      })

      it('el select de los ítems es explícito: sin descripción, ingredientes ni datos del restaurante', async () => {
        responderConsultas({ ofertas: [{ id: 'item-1' }] })
        mockPrisma.itemMenu.findMany.mockResolvedValue([item()])

        await service.getDiscovery()

        const pedido = mockPrisma.itemMenu.findMany.mock.calls[0][0]
        expect(Object.keys(pedido.select).sort()).toEqual(['id', 'imagenUrl', 'nombre', 'precioBase', 'precioDescuento', 'restaurante'])
        expect(pedido.select.restaurante).toEqual({ select: { id: true, nombre: true } })
        expect(pedido.where).toEqual({
          id: { in: ['item-1'] },
          disponible: true,
          precioDescuento: { not: null },
        })
      })

      it('sin ofertas no consulta los ítems y devuelve una lista vacía', async () => {
        const { ofertas } = await service.getDiscovery()

        expect(ofertas).toEqual([])
        expect(mockPrisma.itemMenu.findMany).not.toHaveBeenCalled()
      })

      it('un plato que dejó de estar disponible entre las dos consultas no aparece', async () => {
        responderConsultas({ ofertas: [{ id: 'item-1' }, { id: 'item-2' }] })
        mockPrisma.itemMenu.findMany.mockResolvedValue([item({ id: 'item-2' })])

        const { ofertas } = await service.getDiscovery()

        expect(ofertas.map((o) => o.id)).toEqual(['item-2'])
      })

      it('un descuento guardado que no es válido contra el precio base no se muestra como oferta', async () => {
        responderConsultas({ ofertas: [{ id: 'item-1' }] })
        mockPrisma.itemMenu.findMany.mockResolvedValue([
          item({ precioBase: new Prisma.Decimal('1000'), precioDescuento: 1000 }),
        ])

        const { ofertas } = await service.getDiscovery()

        expect(ofertas).toEqual([])
      })
    })
  })

  // ── GET /discovery/buscar ───────────────────────────────────────────────────

  describe('buscar', () => {
    describe('texto a buscar', () => {
      it.each(['', ' ', 'a', '  a  '])('%j es demasiado corto: 400 y no consulta la base', async (texto) => {
        await expect(service.buscar(texto)).rejects.toThrow(BadRequestException)
        expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
        expect(mockPrisma.restaurante.findMany).not.toHaveBeenCalled()
      })

      it('con dos caracteres ya busca', async () => {
        await service.buscar('ca')

        expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3)
      })

      it('cuenta caracteres y no unidades de UTF-16: un emoji suelto es demasiado corto', async () => {
        await expect(service.buscar('🍕')).rejects.toThrow(BadRequestException)
        expect(mockPrisma.$queryRaw).not.toHaveBeenCalled()
      })

      it('dos emojis ya alcanzan', async () => {
        await service.buscar('🍕🍕')

        expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3)
      })

      it('recorta los espacios y arma el patrón "contiene"', async () => {
        await service.buscar('  cafe ')

        const { ofertas, restaurantes, conPlatos } = consultasDeBusqueda()
        expect(ofertas.valores[0]).toBe('%cafe%')
        expect(restaurantes.valores[0]).toBe('%cafe%')
        expect(conPlatos.valores).toContain('%cafe%')
      })

      it('escapa los comodines de LIKE: % y _ se buscan como texto', async () => {
        await service.buscar('50%_off')

        const { ofertas, restaurantes, conPlatos } = consultasDeBusqueda()
        for (const consultaConPatron of [ofertas, restaurantes, conPlatos]) {
          expect(consultaConPatron.valores).toContain('%50\\%\\_off%')
        }
      })

      it('escapa también la barra invertida', async () => {
        await service.buscar('a\\b')

        expect(consultasDeBusqueda().ofertas.valores[0]).toBe('%a\\\\b%')
      })

      it('el texto buscado va como parámetro, nunca dentro del SQL', async () => {
        const intento = "x'; DROP TABLE restaurante; --"
        await service.buscar(intento)

        for (const { sql, valores } of Object.values(consultasDeBusqueda())) {
          expect(sql).not.toContain('DROP TABLE')
          expect(valores).toContain(`%${intento}%`)
        }
      })
    })

    describe('escaparLike', () => {
      it.each([
        ['cafe', 'cafe'],
        ['100%', '100\\%'],
        ['a_b', 'a\\_b'],
        ['a\\b', 'a\\\\b'],
        ['%_\\', '\\%\\_\\\\'],
        ['Café Ñandú', 'Café Ñandú'],
      ])('%j → %j', (entrada, esperado) => {
        expect(escaparLike(entrada)).toBe(esperado)
      })
    })

    describe('las consultas', () => {
      beforeEach(async () => {
        await service.buscar('cafe')
      })

      it('comparan sin acentos ni mayúsculas (unaccent e ILIKE)', () => {
        for (const { sql } of Object.values(consultasDeBusqueda())) {
          expect(sql).toContain('unaccent(')
          expect(sql).toContain('ILIKE unaccent(')
        }
      })

      it('solo miran restaurantes activos de marcas activas', () => {
        for (const { sql } of Object.values(consultasDeBusqueda())) {
          expect(sql).toContain('r.activo = true')
          expect(sql).toContain('m.activo = true')
        }
      })

      it('los platos y las ofertas tienen que estar disponibles', () => {
        const { conPlatos, ofertas } = consultasDeBusqueda()
        expect(conPlatos.sql).toContain('i.disponible = true')
        expect(ofertas.sql).toContain('i.disponible = true')
        expect(ofertas.sql).toContain('i.precio_descuento IS NOT NULL')
      })

      it('el grupo de restaurantes también busca en el nombre de la marca', () => {
        expect(consultasDeBusqueda().restaurantes.sql).toContain('unaccent(m.nombre) ILIKE')
      })

      it('el grupo de restaurantes con platos deja afuera a los que ya coinciden por nombre', () => {
        const { sql } = consultasDeBusqueda().conPlatos
        expect(sql).toContain('AND NOT (unaccent(r.nombre) ILIKE')
        expect(sql).toContain('unaccent(m.nombre) ILIKE')
      })

      it('el grupo de restaurantes con platos solo pregunta si hay algún plato que coincida: no trae nombres ni cantidades', () => {
        const { sql } = consultasDeBusqueda().conPlatos
        expect(sql).toMatch(/EXISTS \(\s*SELECT 1 FROM item_menu i WHERE i\.restaurante_id = r\.id/)
        expect(sql).not.toContain('array_agg')
        expect(sql).not.toContain('COUNT(')
        expect(sql).not.toContain('GROUP BY')
        expect(sql).toMatch(/^SELECT r\.id FROM restaurante r/)
      })

      it('los topes son 50 restaurantes y 30 ofertas', () => {
        const { ofertas, restaurantes, conPlatos } = consultasDeBusqueda()
        expect(restaurantes.valores).toContain(MAX_RESTAURANTES)
        expect(conPlatos.valores).toContain(MAX_RESTAURANTES)
        expect(ofertas.valores).toContain(MAX_OFERTAS)
      })

      it('ordenan los restaurantes por nombre y las ofertas por porcentaje mayor', () => {
        const { ofertas, restaurantes, conPlatos } = consultasDeBusqueda()
        expect(restaurantes.sql).toContain('ORDER BY r.nombre ASC')
        expect(conPlatos.sql).toContain('ORDER BY r.nombre ASC')
        expect(ofertas.sql).toContain('ORDER BY (i.precio_base - i.precio_descuento) / i.precio_base DESC')
      })
    })

    describe('resultado', () => {
      it('arma los tres grupos', async () => {
        responderConsultas({
          ofertas: [{ id: 'item-1' }],
          restaurantes: [{ id: 'rest-1' }],
          conPlatos: [{ id: 'rest-2' }],
        })
        mockPrisma.restaurante.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(where.id.in.map((id) => restaurante({ id, nombre: `Restaurante ${id}` }))),
        )
        mockPrisma.itemMenu.findMany.mockResolvedValue([item()])

        const resultado = await service.buscar('cafe')

        expect(resultado.ofertas.map((o) => o.id)).toEqual(['item-1'])
        expect(resultado.restaurantes.map((r) => r.id)).toEqual(['rest-1'])
        expect(resultado.restaurantesConPlatos.map((r) => r.id)).toEqual(['rest-2'])
      })

      it('los grupos vienen en el orden en que se muestran: ofertas, restaurantes y restaurantes con platos', async () => {
        const resultado = await service.buscar('cafe')

        expect(Object.keys(resultado)).toEqual(['ofertas', 'restaurantes', 'restaurantesConPlatos'])
      })

      it('los restaurantes con platos tienen la misma forma que los del listado: sin nombres de platos ni cantidades', async () => {
        responderConsultas({ conPlatos: [{ id: 'rest-2' }] })
        mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ id: 'rest-2' })])

        const { restaurantesConPlatos } = await service.buscar('milan')

        expect(restaurantesConPlatos).toEqual([
          {
            id: 'rest-2',
            nombre: 'Burger Lab Palermo',
            direccion: 'Honduras 5100, Palermo',
            logoUrl: 'https://storage/restaurante.png',
            marca: { id: 'marca-1', nombre: 'Burger Lab' },
            cantidadOfertas: 2,
          },
        ])
        expect(restaurantesConPlatos[0]).not.toHaveProperty('platos')
        expect(restaurantesConPlatos[0]).not.toHaveProperty('cantidadPlatos')
      })

      it('respeta el orden que devolvió la base en cada grupo de restaurantes', async () => {
        responderConsultas({
          restaurantes: [{ id: 'rest-b' }, { id: 'rest-a' }, { id: 'rest-c' }],
          conPlatos: [{ id: 'rest-z' }, { id: 'rest-y' }],
        })
        // Prisma no garantiza el orden de un `in`: se devuelven desordenados a propósito.
        mockPrisma.restaurante.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve([...where.id.in].reverse().map((id) => restaurante({ id }))),
        )

        const { restaurantes, restaurantesConPlatos } = await service.buscar('burger')

        expect(restaurantes.map((r) => r.id)).toEqual(['rest-b', 'rest-a', 'rest-c'])
        expect(restaurantesConPlatos.map((r) => r.id)).toEqual(['rest-z', 'rest-y'])
      })

      it('el logo de los restaurantes de la búsqueda también cae al de la marca', async () => {
        responderConsultas({ restaurantes: [{ id: 'rest-1' }] })
        mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ logoUrl: null })])

        const { restaurantes } = await service.buscar('burger')

        expect(restaurantes[0].logoUrl).toBe('https://storage/marca.png')
      })

      it('sin coincidencias devuelve los tres grupos vacíos y no consulta Prisma', async () => {
        const resultado = await service.buscar('zzzz')

        expect(resultado).toEqual({ restaurantes: [], restaurantesConPlatos: [], ofertas: [] })
        expect(mockPrisma.restaurante.findMany).not.toHaveBeenCalled()
        expect(mockPrisma.itemMenu.findMany).not.toHaveBeenCalled()
      })

      it('un grupo vacío no hace consultas: solo se cargan los que tienen ids', async () => {
        responderConsultas({ ofertas: [{ id: 'item-1' }] })
        mockPrisma.itemMenu.findMany.mockResolvedValue([item()])

        const resultado = await service.buscar('milan')

        expect(resultado.restaurantes).toEqual([])
        expect(resultado.restaurantesConPlatos).toEqual([])
        expect(mockPrisma.restaurante.findMany).not.toHaveBeenCalled()
        expect(mockPrisma.itemMenu.findMany).toHaveBeenCalledTimes(1)
      })

      it('al armar los restaurantes vuelve a pedir solo activos de marcas activas, con select explícito', async () => {
        responderConsultas({ restaurantes: [{ id: 'rest-1' }] })
        mockPrisma.restaurante.findMany.mockResolvedValue([restaurante()])

        await service.buscar('burger')

        const pedido = mockPrisma.restaurante.findMany.mock.calls[0][0]
        expect(pedido.where).toEqual({ id: { in: ['rest-1'] }, activo: true, marca: { activo: true } })
        expect(Object.keys(pedido.select).sort()).toEqual(['_count', 'direccion', 'id', 'logoUrl', 'marca', 'nombre'])
      })
    })
  })

  // ── GET /discovery/restaurantes/:id ─────────────────────────────────────────

  describe('getRestaurante', () => {
    const ID = '22222222-2222-4222-a222-222222222222'

    it('devuelve el restaurante y sus ofertas, ya calculadas', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ id: ID })])
      responderConsultas({ ofertas: [{ id: 'item-1' }] })
      mockPrisma.itemMenu.findMany.mockResolvedValue([item()])

      const resultado = await service.getRestaurante(ID)

      expect(resultado).toEqual({
        restaurante: {
          id: ID,
          nombre: 'Burger Lab Palermo',
          direccion: 'Honduras 5100, Palermo',
          logoUrl: 'https://storage/restaurante.png',
          marca: { id: 'marca-1', nombre: 'Burger Lab' },
          cantidadOfertas: 2,
        },
        ofertas: [
          {
            id: 'item-1',
            nombre: 'Milanesa napolitana',
            imagenUrl: 'https://storage/milanesa.jpg',
            precioBase: 4200,
            precioDescuento: 3360,
            porcentajeDescuento: 20,
            precioVigente: 3360,
            restaurante: { id: 'rest-1', nombre: 'Burger Lab Palermo' },
          },
        ],
      })
    })

    it('el logo y la dirección siguen las mismas reglas que en el listado', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ id: ID, logoUrl: null, direccion: null })])

      const { restaurante: r } = await service.getRestaurante(ID)

      expect(r.logoUrl).toBe('https://storage/marca.png')
      expect(r.direccion).toBeNull()
    })

    it('si el restaurante no existe, no está activo o su marca no está activa: 404', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([])

      await expect(service.getRestaurante(ID)).rejects.toThrow(NotFoundException)
    })

    it('pide el restaurante solo si está activo y su marca también, con select explícito', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ id: ID })])

      await service.getRestaurante(ID)

      const pedido = mockPrisma.restaurante.findMany.mock.calls[0][0]
      expect(pedido.where).toEqual({ id: { in: [ID] }, activo: true, marca: { activo: true } })
      expect(Object.keys(pedido.select).sort()).toEqual(['_count', 'direccion', 'id', 'logoUrl', 'marca', 'nombre'])
      expect(JSON.stringify(pedido.select)).not.toContain('mpAccessToken')
    })

    it('la consulta de ofertas es de ese restaurante: disponibles, en descuento, por porcentaje mayor y con tope de 30', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ id: ID })])

      await service.getRestaurante(ID)

      const { sql, valores } = consulta(mockPrisma.$queryRaw.mock.calls[0])
      expect(sql).toContain('i.restaurante_id = ?::text')
      expect(sql).toContain('i.disponible = true')
      expect(sql).toContain('i.precio_descuento IS NOT NULL')
      expect(sql).toContain('r.activo = true')
      expect(sql).toContain('m.activo = true')
      expect(sql).toContain('ORDER BY (i.precio_base - i.precio_descuento) / i.precio_base DESC')
      expect(sql).not.toContain('unaccent')
      expect(valores).toEqual([ID, MAX_OFERTAS])
    })

    it('las ofertas salen en el orden que devuelve la base', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ id: ID })])
      responderConsultas({ ofertas: [{ id: 'item-b' }, { id: 'item-a' }] })
      mockPrisma.itemMenu.findMany.mockResolvedValue([
        item({ id: 'item-a', precioBase: new Prisma.Decimal('1000'), precioDescuento: 900 }),
        item({ id: 'item-b', precioBase: new Prisma.Decimal('1000'), precioDescuento: 500 }),
      ])

      const { ofertas } = await service.getRestaurante(ID)

      expect(ofertas.map((o) => o.id)).toEqual(['item-b', 'item-a'])
    })

    it('sin ofertas devuelve una lista vacía y no consulta los ítems', async () => {
      mockPrisma.restaurante.findMany.mockResolvedValue([restaurante({ id: ID })])

      const { ofertas } = await service.getRestaurante(ID)

      expect(ofertas).toEqual([])
      expect(mockPrisma.itemMenu.findMany).not.toHaveBeenCalled()
    })
  })
})
