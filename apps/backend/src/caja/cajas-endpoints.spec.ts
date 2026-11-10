import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { CajasController } from './cajas.controller'
import { CajasService, MENSAJE_CAJA_ABIERTA } from './cajas.service'

// La ruta, los guards de permisos, el ValidationPipe y el service reales; la base, cajas en memoria de dos restaurantes.
// En PATCH el rol lo pide el service con el restaurante de la caja, así que la matriz también prueba eso.
describe('endpoints de las cajas', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  type Caja = { id: string; restauranteId: string; nombre: string; activa: boolean; createdAt: Date }
  let cajas: Caja[]
  const REST = MUNDO.REST_1
  const caja = (id: string, restauranteId: string, nombre: string): Caja => ({
    id,
    restauranteId,
    nombre,
    activa: true,
    createdAt: new Date('2026-11-10T12:00:00Z'),
  })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(CajasController, [CajasService, { provide: PrismaService, useValue: comoPrisma(prisma) }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    cajas = [caja('caja-1', REST, 'Principal'), caja('caja-b', MUNDO.REST_B, 'Principal')]
    prisma.caja.findMany.mockImplementation(async ({ where }) => cajas.filter((c) => c.restauranteId === where.restauranteId))
    prisma.caja.findUnique.mockImplementation(async ({ where }) => cajas.find((c) => c.id === where.id) ?? null)
    prisma.caja.create.mockImplementation(async ({ data }) => {
      const nueva = caja(`caja-${cajas.length}`, data.restauranteId, data.nombre)
      cajas.push(nueva)
      return nueva
    })
    prisma.caja.update.mockImplementation(async ({ where, data }) => {
      const fila = cajas.find((c) => c.id === where.id) as Caja
      if (data.nombre !== undefined) fila.nombre = data.nombre
      if (data.activa !== undefined) fila.activa = data.activa
      return fila
    })
    prisma.turnoCaja.findFirst.mockResolvedValue(null)
  })

  describe('GET /cajas (el grupo CAJA del restaurante de la query)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
    ])('%s lista solo las cajas del restaurante', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/cajas', { cuenta, query: { restauranteId: REST } })

      expect(res.status).toBe(200)
      expect(res.body.map((c: Caja) => c.id)).toEqual(['caja-1'])
    })

    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/cajas', { cuenta, query: { restauranteId: REST } })

      expect(res.status).toBe(403)
      expect(prisma.caja.findMany).not.toHaveBeenCalled()
    })

    it('sin token, 401; sin restauranteId, 400; con un restaurante que no existe, 403', async () => {
      expect((await api.pedir('get', '/cajas', { query: { restauranteId: REST } })).status).toBe(401)
      expect((await api.pedir('get', '/cajas', { cuenta: CUENTAS.OWNER_A })).status).toBe(400)
      expect((await api.pedir('get', '/cajas', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: 'no-existe' } })).status).toBe(403)
      expect(prisma.caja.findMany).not.toHaveBeenCalled()
    })
  })

  describe('POST /cajas (OWNER y GERENTE del restaurante del body)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
    ])('%s crea la caja: 201, sin espacios de más y sin los campos que no van', async (_caso, cuenta) => {
      const res = await api.pedir('post', '/cajas', {
        cuenta,
        body: { restauranteId: REST, nombre: '  Barra  ', activa: false, id: 'elegido' },
      })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ restauranteId: REST, nombre: 'Barra', activa: true })
      expect(prisma.caja.create).toHaveBeenCalledWith(expect.objectContaining({ data: { restauranteId: REST, nombre: 'Barra' } }))
    })

    it.each([
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ])('%s recibe 403', async (_caso, cuenta) => {
      const res = await api.pedir('post', '/cajas', { cuenta, body: { restauranteId: REST, nombre: 'Barra' } })

      expect(res.status).toBe(403)
      expect(prisma.caja.create).not.toHaveBeenCalled()
    })

    it('sin restauranteId, 400; con uno que no existe, 403', async () => {
      expect((await api.pedir('post', '/cajas', { cuenta: CUENTAS.OWNER_A, body: { nombre: 'Barra' } })).status).toBe(400)
      expect(
        (await api.pedir('post', '/cajas', { cuenta: CUENTAS.OWNER_A, body: { restauranteId: 'no-existe', nombre: 'Barra' } }))
          .status,
      ).toBe(403)
      expect(prisma.caja.create).not.toHaveBeenCalled()
    })

    it.each([
      ['en blanco', '   '],
      ['de 61 caracteres', 'x'.repeat(61)],
      ['que no es un texto', 7],
    ])('un nombre %s es 400', async (_caso, nombre) => {
      const res = await api.pedir('post', '/cajas', { cuenta: CUENTAS.OWNER_A, body: { restauranteId: REST, nombre } })

      expect(res.status).toBe(400)
      expect(prisma.caja.create).not.toHaveBeenCalled()
    })

    it('un nombre de 60 caracteres entra', async () => {
      const res = await api.pedir('post', '/cajas', { cuenta: CUENTAS.OWNER_A, body: { restauranteId: REST, nombre: 'x'.repeat(60) } })

      expect(res.status).toBe(201)
    })
  })

  describe('PATCH /cajas/:id (OWNER y GERENTE del restaurante de la caja)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
    ])('%s renombra y desactiva', async (_caso, cuenta) => {
      const res = await api.pedir('patch', '/cajas/caja-1', { cuenta, body: { nombre: 'Barra', activa: false } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: 'caja-1', nombre: 'Barra', activa: false })
    })

    it.each([
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403 y la caja no cambia', async (_caso, cuenta) => {
      const res = await api.pedir('patch', '/cajas/caja-1', { cuenta, body: { activa: false } })

      expect(res.status).toBe(403)
      expect(prisma.caja.update).not.toHaveBeenCalled()
    })

    it('una caja de otro restaurante: 403 para quien no es de ese restaurante', async () => {
      const res = await api.pedir('patch', '/cajas/caja-b', { cuenta: CUENTAS.OWNER_A, body: { nombre: 'Mía' } })

      expect(res.status).toBe(403)
      expect(prisma.caja.update).not.toHaveBeenCalled()
    })

    it('sin token, 401; una caja que no existe, 404', async () => {
      expect((await api.pedir('patch', '/cajas/caja-1', { body: { activa: false } })).status).toBe(401)
      expect((await api.pedir('patch', '/cajas/no-existe', { cuenta: CUENTAS.OWNER_A, body: { activa: false } })).status).toBe(404)
    })

    it.each([
      ['vacío', {}],
      ['solo con campos que no van', { restauranteId: MUNDO.REST_B, id: 'otra' }],
      ['con el nombre en blanco', { nombre: '  ' }],
      ['con un nombre de 61 caracteres', { nombre: 'x'.repeat(61) }],
      ['con el nombre en null', { nombre: null }],
      ['con activa que no es booleano', { activa: 'no' }],
      ['con activa en null', { activa: null }],
    ])('un body %s es 400', async (_caso, body) => {
      const res = await api.pedir('patch', '/cajas/caja-1', { cuenta: CUENTAS.OWNER_A, body })

      expect(res.status).toBe(400)
      expect(prisma.caja.update).not.toHaveBeenCalled()
    })

    it('desactivar una caja abierta es 409', async () => {
      prisma.turnoCaja.findFirst.mockResolvedValue({ id: 'apertura-1' })

      const res = await api.pedir('patch', '/cajas/caja-1', { cuenta: CUENTAS.OWNER_A, body: { activa: false } })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe(MENSAJE_CAJA_ABIERTA)
      expect(cajas[0].activa).toBe(true)
    })

    it('activar una caja activa es 200 y la deja igual', async () => {
      const res = await api.pedir('patch', '/cajas/caja-1', { cuenta: CUENTAS.GERENTE, body: { activa: true } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: 'caja-1', nombre: 'Principal', activa: true })
    })
  })
})
