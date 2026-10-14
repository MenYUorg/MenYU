import * as request from 'supertest'
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DiscoveryController } from './discovery.controller'
import { DiscoveryService } from './discovery.service'

// Los endpoints de Discovery son públicos: no hay guards. Acá se prueba lo que pone el controller y la validación
// de `q` (con el mismo ValidationPipe que main.ts); las consultas se prueban en discovery.service.spec.
describe('endpoints de Discovery', () => {
  let app: INestApplication
  const mockDiscovery = {
    getDiscovery: jest.fn(),
    buscar: jest.fn(),
    getRestaurante: jest.fn(),
  }
  const LISTADO = { restaurantes: [{ id: 'rest-1' }], ofertas: [] }
  const BUSQUEDA = { restaurantes: [], restaurantesConPlatos: [], ofertas: [] }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DiscoveryController],
      providers: [{ provide: DiscoveryService, useValue: mockDiscovery }],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockDiscovery.getDiscovery.mockResolvedValue(LISTADO)
    mockDiscovery.buscar.mockResolvedValue(BUSQUEDA)
  })

  const buscar = (consulta: string) => request(app.getHttpServer()).get(`/discovery/buscar${consulta}`)

  describe('GET /discovery', () => {
    it('es público: responde sin iniciar sesión', async () => {
      const res = await request(app.getHttpServer()).get('/discovery')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(LISTADO)
      expect(mockDiscovery.getDiscovery).toHaveBeenCalledTimes(1)
    })
  })

  describe('GET /discovery/buscar', () => {
    it('es público y le pasa el texto al servicio', async () => {
      const res = await buscar('?q=cafe')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(BUSQUEDA)
      expect(mockDiscovery.buscar).toHaveBeenCalledWith('cafe')
    })

    it('acepta acentos y la Ñ (URL codificada)', async () => {
      const res = await buscar(`?q=${encodeURIComponent('Ñandú')}`)

      expect(res.status).toBe(200)
      expect(mockDiscovery.buscar).toHaveBeenCalledWith('Ñandú')
    })

    it('recorta los espacios de los costados', async () => {
      const res = await buscar('?q=%20%20cafe%20')

      expect(res.status).toBe(200)
      expect(mockDiscovery.buscar).toHaveBeenCalledWith('cafe')
    })

    it('con dos caracteres ya busca', async () => {
      const res = await buscar('?q=ca')

      expect(res.status).toBe(200)
      expect(mockDiscovery.buscar).toHaveBeenCalledWith('ca')
    })

    it.each([
      ['sin q', ''],
      ['q vacío', '?q='],
      ['q de una letra', '?q=a'],
      ['q de una letra con espacios', '?q=%20a%20'],
      ['q de solo espacios', '?q=%20%20%20'],
      ['q de un solo emoji (un carácter)', `?q=${encodeURIComponent('🍕')}`],
      ['q con el carácter nulo (PostgreSQL no lo acepta)', '?q=ab%00c'],
    ])('%s: 400 y no busca', async (_descripcion, consulta) => {
      const res = await buscar(consulta)

      expect(res.status).toBe(400)
      expect(mockDiscovery.buscar).not.toHaveBeenCalled()
    })

    it('el mensaje de q corto es claro', async () => {
      const res = await buscar('?q=a')

      expect(res.body.message).toContain('La búsqueda necesita al menos 2 caracteres')
    })

    it('q de más de 60 caracteres: 400', async () => {
      const res = await buscar(`?q=${'a'.repeat(61)}`)

      expect(res.status).toBe(400)
      expect(mockDiscovery.buscar).not.toHaveBeenCalled()
    })

    it('q de exactamente 60 caracteres: busca', async () => {
      const res = await buscar(`?q=${'a'.repeat(60)}`)

      expect(res.status).toBe(200)
      expect(mockDiscovery.buscar).toHaveBeenCalledWith('a'.repeat(60))
    })

    it('q repetido (?q=a&q=b) no es un texto: 400', async () => {
      const res = await buscar('?q=ca&q=fe')

      expect(res.status).toBe(400)
      expect(mockDiscovery.buscar).not.toHaveBeenCalled()
    })

    it('los comodines llegan tal cual al servicio, que los escapa', async () => {
      const res = await buscar(`?q=${encodeURIComponent('50%_')}`)

      expect(res.status).toBe(200)
      expect(mockDiscovery.buscar).toHaveBeenCalledWith('50%_')
    })
  })

  describe('GET /discovery/restaurantes/:id', () => {
    const ID = '22222222-2222-4222-a222-222222222222'
    const DETALLE = { restaurante: { id: ID }, ofertas: [] }
    const restaurante = (id: string) => request(app.getHttpServer()).get(`/discovery/restaurantes/${id}`)

    beforeEach(() => {
      mockDiscovery.getRestaurante.mockResolvedValue(DETALLE)
    })

    it('es público: responde sin iniciar sesión y le pasa el id al servicio', async () => {
      const res = await restaurante(ID)

      expect(res.status).toBe(200)
      expect(res.body).toEqual(DETALLE)
      expect(mockDiscovery.getRestaurante).toHaveBeenCalledWith(ID)
    })

    it.each([
      ['un texto cualquiera', 'abc'],
      ['un número', '123'],
      ['un id con guiones pero sin forma de UUID', 'e2e-disc-r1'],
      ['un id con el carácter nulo (PostgreSQL no lo acepta)', 'ab%00c'],
      ['un intento de inyección SQL', encodeURIComponent("' OR 1=1 --")],
    ])('%s: 404, igual que un restaurante que no existe, y no llega al servicio', async (_descripcion, id) => {
      const res = await restaurante(id)

      expect(res.status).toBe(404)
      expect(res.body.message).toBe('Restaurante no encontrado')
      expect(mockDiscovery.getRestaurante).not.toHaveBeenCalled()
    })

    it('el 404 del servicio (no existe o no está activo) le llega al cliente', async () => {
      mockDiscovery.getRestaurante.mockRejectedValue(new NotFoundException('Restaurante no encontrado'))

      const res = await restaurante(ID)

      expect(res.status).toBe(404)
      expect(res.body.message).toBe('Restaurante no encontrado')
    })

    it('no pisa a /discovery/buscar', async () => {
      const res = await buscar('?q=cafe')

      expect(res.status).toBe(200)
      expect(mockDiscovery.getRestaurante).not.toHaveBeenCalled()
      expect(mockDiscovery.buscar).toHaveBeenCalledWith('cafe')
    })
  })
})
