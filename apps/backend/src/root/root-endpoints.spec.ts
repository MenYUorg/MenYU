import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints } from '../test/app-endpoints'
import { NO_ROOT } from '../test/root-mock'
import { RootDuenosController } from './duenos/root-duenos.controller'
import { RootDuenosService } from './duenos/root-duenos.service'
import { RootRootsController } from './roots/root-roots.controller'
import { RootRootsService } from './roots/root-roots.service'

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'

const JUAN = { email: 'juan@laparrilla.com', nombre: 'Juan' }

describe('endpoints de dueños de ROOT', () => {
  let api: AppDeEndpoints
  const duenos = { listar: jest.fn(), invitar: jest.fn(), quitar: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RootDuenosController, [{ provide: RootDuenosService, useValue: duenos }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    duenos.listar.mockResolvedValue([])
    duenos.invitar.mockResolvedValue({ usuarioId: 'usuario-juan', membresiaId: 'membresia-1', invitacionEnviada: true })
    duenos.quitar.mockResolvedValue(undefined)
  })

  const RUTAS: Array<[string, Metodo, string, number, jest.Mock, object?]> = [
    ['GET /root/duenos', 'get', '/root/duenos', 200, duenos.listar],
    ['POST /root/marcas/:id/duenos', 'post', '/root/marcas/m-001/duenos', 201, duenos.invitar, JUAN],
    ['DELETE /root/duenos/:membresiaId', 'delete', '/root/duenos/membresia-1', 204, duenos.quitar],
  ]

  describe.each(RUTAS)('%s', (_nombre, metodo, ruta, exito, servicio, body) => {
    it(`ROOT: ${exito}`, async () => {
      const res = await api.pedir(metodo, ruta, { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(exito)
      expect(servicio).toHaveBeenCalledTimes(1)
    })

    it.each(NO_ROOT)('%s: 403 y el servicio no se llama', async (_rol, cuenta) => {
      const res = await api.pedir(metodo, ruta, { cuenta, body })

      expect(res.status).toBe(403)
      expect(servicio).not.toHaveBeenCalled()
    })

    it('sin token: 401 y el servicio no se llama', async () => {
      const res = await api.pedir(metodo, ruta, { body })

      expect(res.status).toBe(401)
      expect(servicio).not.toHaveBeenCalled()
    })
  })

  describe('lo que le llega al servicio', () => {
    it('POST /root/marcas/:id/duenos: el id de la marca (aunque no sea UUID), el email, el nombre y la cuenta ROOT', async () => {
      const res = await api.pedir('post', '/root/marcas/m-001/duenos', { cuenta: CUENTAS.ROOT, body: JUAN })

      expect(duenos.invitar).toHaveBeenCalledWith('m-001', JUAN, CUENTAS.ROOT)
      expect(res.body).toEqual({ usuarioId: 'usuario-juan', membresiaId: 'membresia-1', invitacionEnviada: true })
    })

    it('el email se normaliza (sin espacios y en minúsculas) y el nombre se recorta', async () => {
      await api.pedir('post', '/root/marcas/m-001/duenos', { cuenta: CUENTAS.ROOT, body: { email: '  Juan@LaParrilla.COM ', nombre: '  Juan ' } })

      expect(duenos.invitar).toHaveBeenCalledWith('m-001', JUAN, CUENTAS.ROOT)
    })

    it('se descartan los campos de más: no se puede mandar el rol, otra marca ni una contraseña por el body', async () => {
      await api.pedir('post', '/root/marcas/m-001/duenos', {
        cuenta: CUENTAS.ROOT,
        body: { ...JUAN, rol: 'GERENTE', marcaId: 'otra', restauranteId: 'r-1', password: 'Caracol-Violeta-48', esRoot: true },
      })

      expect(duenos.invitar).toHaveBeenCalledWith('m-001', JUAN, CUENTAS.ROOT)
    })

    it('GET con q: llega recortada', async () => {
      await api.pedir('get', '/root/duenos', { cuenta: CUENTAS.ROOT, query: { q: '  fiore ' } })

      expect(duenos.listar).toHaveBeenCalledWith({ q: 'fiore' })
    })

    it('DELETE lleva el id de la membresía y la cuenta ROOT', async () => {
      await api.pedir('delete', '/root/duenos/membresia-1', { cuenta: CUENTAS.ROOT })

      expect(duenos.quitar).toHaveBeenCalledWith('membresia-1', CUENTAS.ROOT)
    })
  })

  describe('validación', () => {
    it.each([
      ['un email inválido', { ...JUAN, email: 'no-es-email' }],
      ['sin email', { nombre: 'Juan' }],
      ['un email vacío', { ...JUAN, email: '' }],
      ['un email larguísimo', { ...JUAN, email: `${'a'.repeat(250)}@ejemplo.com` }],
      ['sin nombre', { email: JUAN.email }],
      ['un nombre en blanco', { ...JUAN, nombre: '   ' }],
      ['un nombre de 101 caracteres', { ...JUAN, nombre: 'a'.repeat(101) }],
      ['el carácter nulo en el nombre', { ...JUAN, nombre: 'Ju\u0000an' }],
      ['un nombre que no es texto', { ...JUAN, nombre: 123 }],
    ])('POST con %s responde 400', async (_caso, body) => {
      const res = await api.pedir('post', '/root/marcas/m-001/duenos', { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(400)
      expect(duenos.invitar).not.toHaveBeenCalled()
    })

    it('un nombre de 100 caracteres está bien', async () => {
      const res = await api.pedir('post', '/root/marcas/m-001/duenos', { cuenta: CUENTAS.ROOT, body: { ...JUAN, nombre: 'a'.repeat(100) } })

      expect(res.status).toBe(201)
    })

    it('GET con una q de más de 100 caracteres o con el carácter nulo responde 400', async () => {
      const larga = await api.pedir('get', '/root/duenos', { cuenta: CUENTAS.ROOT, query: { q: 'a'.repeat(101) } })
      const nula = await api.pedir('get', '/root/duenos', { cuenta: CUENTAS.ROOT, query: { q: 'a\u0000b' } })

      expect([larga.status, nula.status]).toEqual([400, 400])
      expect(duenos.listar).not.toHaveBeenCalled()
    })

    it.each([
      ['/root/duenos/a.b', 'delete'],
      ['/root/duenos/a%20b', 'delete'],
      ['/root/duenos/%00', 'delete'],
      ['/root/marcas/a.b/duenos', 'post'],
    ] as const)('un id con forma de no-id (%s) responde 404 sin llegar al servicio', async (ruta, metodo) => {
      const res = await api.pedir(metodo, ruta, { cuenta: CUENTAS.ROOT, body: JUAN })

      expect(res.status).toBe(404)
      expect(duenos.invitar).not.toHaveBeenCalled()
      expect(duenos.quitar).not.toHaveBeenCalled()
    })
  })

  // Con Supabase el email y la contraseña son de la persona: ROOT no los cambia (la recuperación está en web-auth).
  it.each([
    ['patch', '/root/duenos/membresia-1'],
    ['post', '/root/duenos/membresia-1/restablecer-password'],
  ] as const)('%s %s ya no existe (404)', async (metodo, ruta) => {
    const res = await api.pedir(metodo, ruta, { cuenta: CUENTAS.ROOT, body: { email: 'otro@laparrilla.com' } })

    expect(res.status).toBe(404)
  })
})

describe('endpoints de cuentas ROOT', () => {
  let api: AppDeEndpoints
  const roots = { listar: jest.fn(), invitar: jest.fn() }
  const CARLA = { email: 'carla@ejemplo.com', nombre: 'Carla' }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RootRootsController, [{ provide: RootRootsService, useValue: roots }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    roots.listar.mockResolvedValue([])
    roots.invitar.mockResolvedValue({ usuarioId: 'usuario-carla', email: 'carla@ejemplo.com', invitacionEnviada: true })
  })

  const RUTAS: Array<[string, Metodo, string, number, jest.Mock, object?]> = [
    ['GET /root/roots', 'get', '/root/roots', 200, roots.listar],
    ['POST /root/roots', 'post', '/root/roots', 201, roots.invitar, CARLA],
  ]

  describe.each(RUTAS)('%s', (_nombre, metodo, ruta, exito, servicio, body) => {
    it(`ROOT: ${exito}`, async () => {
      const res = await api.pedir(metodo, ruta, { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(exito)
      expect(servicio).toHaveBeenCalledTimes(1)
    })

    it.each(NO_ROOT)('%s: 403 y el servicio no se llama', async (_rol, cuenta) => {
      const res = await api.pedir(metodo, ruta, { cuenta, body })

      expect(res.status).toBe(403)
      expect(servicio).not.toHaveBeenCalled()
    })

    it('sin token: 401 y el servicio no se llama', async () => {
      const res = await api.pedir(metodo, ruta, { body })

      expect(res.status).toBe(401)
      expect(servicio).not.toHaveBeenCalled()
    })
  })

  it('GET lleva la cuenta ROOT (para marcar la propia)', async () => {
    await api.pedir('get', '/root/roots', { cuenta: CUENTAS.ROOT })

    expect(roots.listar).toHaveBeenCalledWith(CUENTAS.ROOT)
  })

  it('POST lleva el email normalizado, el nombre y la cuenta; descarta el rol y otros campos', async () => {
    const res = await api.pedir('post', '/root/roots', {
      cuenta: CUENTAS.ROOT,
      body: { email: ' Carla@Ejemplo.com', nombre: ' Carla ', rol: 'OWNER', marcaId: 'x', esRoot: false, password: 'x' },
    })

    expect(roots.invitar).toHaveBeenCalledWith(CARLA, CUENTAS.ROOT)
    expect(res.body).toEqual({ usuarioId: 'usuario-carla', email: 'carla@ejemplo.com', invitacionEnviada: true })
  })

  it.each([
    ['un email inválido', { ...CARLA, email: 'no-es-email' }],
    ['sin nombre', { email: CARLA.email }],
    ['un nombre en blanco', { ...CARLA, nombre: ' ' }],
  ])('POST con %s responde 400', async (_caso, body) => {
    const res = await api.pedir('post', '/root/roots', { cuenta: CUENTAS.ROOT, body })

    expect(res.status).toBe(400)
    expect(roots.invitar).not.toHaveBeenCalled()
  })

  // Decisión 15: las cuentas ROOT no se borran ni dejan de ser ROOT desde la app ni la API. No hay ruta, ni siquiera para ROOT.
  it.each(['delete', 'put', 'patch'] as const)('%s /root/roots/:id no existe (404), tampoco para ROOT', async (metodo) => {
    const res = await api.pedir(metodo, '/root/roots/root-2', { cuenta: CUENTAS.ROOT, body: { email: 'x@ejemplo.com' } })

    expect(res.status).toBe(404)
  })

  it('DELETE /root/roots tampoco existe', async () => {
    const res = await api.pedir('delete', '/root/roots', { cuenta: CUENTAS.ROOT })

    expect(res.status).toBe(404)
  })

  it('restablecer la contraseña de otra cuenta ROOT ya no existe (404): la persona usa "Olvidé mi contraseña"', async () => {
    const res = await api.pedir('post', '/root/roots/root-2/restablecer-password', { cuenta: CUENTAS.ROOT })

    expect(res.status).toBe(404)
  })
})
