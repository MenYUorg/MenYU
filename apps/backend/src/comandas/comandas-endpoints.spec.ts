import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO } from '../test/app-endpoints'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { ComandasController } from './comandas.controller'
import { ComandasService, MENSAJE_NOMBRE_REPETIDO, mensajeConPlatosAsignados } from './comandas.service'

// La ruta, los guards de permisos, el ValidationPipe y el service reales; la base, comandas en memoria de dos
// restaurantes. En PATCH el rol lo pide el service con el restaurante de la comanda, así que la matriz también prueba eso.
describe('endpoints de las comandas', () => {
  let api: AppDeEndpoints
  let prisma: PrismaMock
  type Comanda = { id: string; restauranteId: string; nombre: string; activa: boolean }
  let comandas: Comanda[]
  const REST = MUNDO.REST_1
  const comanda = (id: string, restauranteId: string, nombre: string): Comanda => ({ id, restauranteId, nombre, activa: true })

  beforeAll(async () => {
    prisma = crearPrismaMock()
    api = await crearAppDeEndpoints(ComandasController, [ComandasService, { provide: PrismaService, useValue: comoPrisma(prisma) }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    comandas = [comanda('com-1', REST, 'Cocina'), comanda('com-b', MUNDO.REST_B, 'Cocina')]
    prisma.comanda.findMany.mockImplementation(async ({ where }) => comandas.filter((c) => c.restauranteId === where.restauranteId))
    prisma.comanda.findUnique.mockImplementation(async ({ where }) => comandas.find((c) => c.id === where.id) ?? null)
    prisma.comanda.create.mockImplementation(async ({ data }) => {
      const nueva = comanda(`com-${comandas.length}`, data.restauranteId, data.nombre)
      comandas.push(nueva)
      return nueva
    })
    prisma.comanda.update.mockImplementation(async ({ where, data }) => {
      const fila = comandas.find((c) => c.id === where.id) as Comanda
      if (data.nombre !== undefined) fila.nombre = data.nombre
      if (data.activa !== undefined) fila.activa = data.activa
      return fila
    })
    prisma.itemMenu.count.mockResolvedValue(0)
  })

  describe('GET /comandas (todo el personal del restaurante de la query)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
    ])('%s lista solo las comandas del restaurante', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/comandas', { cuenta, query: { restauranteId: REST } })

      expect(res.status).toBe(200)
      expect(res.body.map((c: Comanda) => c.id)).toEqual(['com-1'])
    })

    it.each([
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
      ['una cuenta sin membresías', CUENTAS.SIN_MEMBRESIAS],
    ])('%s recibe 403', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/comandas', { cuenta, query: { restauranteId: REST } })

      expect(res.status).toBe(403)
      expect(prisma.comanda.findMany).not.toHaveBeenCalled()
    })

    it('sin token, 401; sin restauranteId, 400; con un restaurante que no existe, 403', async () => {
      expect((await api.pedir('get', '/comandas', { query: { restauranteId: REST } })).status).toBe(401)
      expect((await api.pedir('get', '/comandas', { cuenta: CUENTAS.OWNER_A })).status).toBe(400)
      expect((await api.pedir('get', '/comandas', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: 'no-existe' } })).status).toBe(403)
      expect(prisma.comanda.findMany).not.toHaveBeenCalled()
    })
  })

  describe('POST /comandas (OWNER y GERENTE del restaurante del body)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
    ])('%s crea la comanda: 201, sin espacios de más y sin los campos que no van', async (_caso, cuenta) => {
      const res = await api.pedir('post', '/comandas', {
        cuenta,
        body: { restauranteId: REST, nombre: '  Barra  ', activa: false, id: 'elegido' },
      })

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ restauranteId: REST, nombre: 'Barra', activa: true })
      expect(prisma.comanda.create).toHaveBeenCalledWith(expect.objectContaining({ data: { restauranteId: REST, nombre: 'Barra' } }))
    })

    it.each([
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403', async (_caso, cuenta) => {
      const res = await api.pedir('post', '/comandas', { cuenta, body: { restauranteId: REST, nombre: 'Barra' } })

      expect(res.status).toBe(403)
      expect(prisma.comanda.create).not.toHaveBeenCalled()
    })

    it('sin token, 401; sin restauranteId, 400; con uno que no existe, 403', async () => {
      expect((await api.pedir('post', '/comandas', { body: { restauranteId: REST, nombre: 'Barra' } })).status).toBe(401)
      expect((await api.pedir('post', '/comandas', { cuenta: CUENTAS.OWNER_A, body: { nombre: 'Barra' } })).status).toBe(400)
      expect(
        (await api.pedir('post', '/comandas', { cuenta: CUENTAS.OWNER_A, body: { restauranteId: 'no-existe', nombre: 'Barra' } }))
          .status,
      ).toBe(403)
      expect(prisma.comanda.create).not.toHaveBeenCalled()
    })

    it.each([
      ['en blanco', '   '],
      ['de 41 caracteres', 'x'.repeat(41)],
      ['que no es un texto', 7],
    ])('un nombre %s es 400', async (_caso, nombre) => {
      const res = await api.pedir('post', '/comandas', { cuenta: CUENTAS.OWNER_A, body: { restauranteId: REST, nombre } })

      expect(res.status).toBe(400)
      expect(prisma.comanda.create).not.toHaveBeenCalled()
    })

    it('un nombre de 40 caracteres entra', async () => {
      const res = await api.pedir('post', '/comandas', { cuenta: CUENTAS.OWNER_A, body: { restauranteId: REST, nombre: 'x'.repeat(40) } })

      expect(res.status).toBe(201)
    })
  })

  describe('PATCH /comandas/:id (OWNER y GERENTE del restaurante de la comanda)', () => {
    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE', CUENTAS.GERENTE],
    ])('%s renombra (sin espacios de más) y desactiva', async (_caso, cuenta) => {
      const res = await api.pedir('patch', '/comandas/com-1', { cuenta, body: { nombre: '  Barra ', activa: false } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: 'com-1', nombre: 'Barra', activa: false })
    })

    it.each([
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el MOZO', CUENTAS.MOZO],
      ['COCINA', CUENTAS.COCINA],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['ROOT', CUENTAS.ROOT],
    ])('%s recibe 403 y la comanda no cambia', async (_caso, cuenta) => {
      const res = await api.pedir('patch', '/comandas/com-1', { cuenta, body: { activa: false } })

      expect(res.status).toBe(403)
      expect(prisma.comanda.update).not.toHaveBeenCalled()
      expect(comandas[0].activa).toBe(true)
    })

    it('una comanda de otro restaurante: 403 para el GERENTE y para el OWNER que no son de ese restaurante', async () => {
      for (const cuenta of [CUENTAS.GERENTE, CUENTAS.OWNER_A]) {
        const res = await api.pedir('patch', '/comandas/com-b', { cuenta, body: { nombre: 'Mía' } })

        expect(res.status).toBe(403)
      }
      expect(prisma.comanda.update).not.toHaveBeenCalled()
    })

    it('sin token, 401; una comanda que no existe, 404', async () => {
      expect((await api.pedir('patch', '/comandas/com-1', { body: { activa: false } })).status).toBe(401)
      expect((await api.pedir('patch', '/comandas/no-existe', { cuenta: CUENTAS.OWNER_A, body: { activa: false } })).status).toBe(404)
    })

    it.each([
      ['vacío', {}],
      ['solo con campos que no van', { restauranteId: MUNDO.REST_B, id: 'otra' }],
      ['con el nombre en blanco', { nombre: '  ' }],
      ['con un nombre de 41 caracteres', { nombre: 'x'.repeat(41) }],
      ['con el nombre en null', { nombre: null }],
      ['con activa que no es booleano', { activa: 'no' }],
      ['con activa en null', { activa: null }],
    ])('un body %s es 400', async (_caso, body) => {
      const res = await api.pedir('patch', '/comandas/com-1', { cuenta: CUENTAS.OWNER_A, body })

      expect(res.status).toBe(400)
      expect(prisma.comanda.update).not.toHaveBeenCalled()
    })

    it('desactivar una comanda con platos asignados es 409 y no se desactiva', async () => {
      prisma.itemMenu.count.mockResolvedValue(3)

      const res = await api.pedir('patch', '/comandas/com-1', { cuenta: CUENTAS.OWNER_A, body: { activa: false } })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe(mensajeConPlatosAsignados(3))
      expect(comandas[0].activa).toBe(true)
    })

    it('un nombre repetido (P2002 del único) es 409', async () => {
      prisma.comanda.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { modelName: 'Comanda', target: ['restaurante_id', 'nombre'] },
        }),
      )

      const res = await api.pedir('patch', '/comandas/com-1', { cuenta: CUENTAS.GERENTE, body: { nombre: 'Barra' } })

      expect(res.status).toBe(409)
      expect(res.body.message).toBe(MENSAJE_NOMBRE_REPETIDO)
    })

    it('activar una comanda activa es 200 y la deja igual', async () => {
      const res = await api.pedir('patch', '/comandas/com-1', { cuenta: CUENTAS.GERENTE, body: { activa: true } })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ id: 'com-1', nombre: 'Cocina', activa: true })
    })
  })
})
