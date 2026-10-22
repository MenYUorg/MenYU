import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints } from '../test/app-endpoints'
import { NO_ROOT } from '../test/root-mock'
import { RootDuenosController } from './duenos/root-duenos.controller'
import { RootDuenosService } from './duenos/root-duenos.service'
import { RootRootsController } from './roots/root-roots.controller'
import { RootRootsService } from './roots/root-roots.service'

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'


describe('endpoints de dueños de ROOT', () => {
  let api: AppDeEndpoints
  const duenos = { listar: jest.fn(), crear: jest.fn(), cambiarEmail: jest.fn(), restablecerPassword: jest.fn(), eliminar: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RootDuenosController, [{ provide: RootDuenosService, useValue: duenos }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    duenos.listar.mockResolvedValue([])
    duenos.crear.mockResolvedValue({ id: 'owner-9' })
    duenos.cambiarEmail.mockResolvedValue({ id: 'owner-1' })
    duenos.restablecerPassword.mockResolvedValue({ id: 'owner-1' })
    duenos.eliminar.mockResolvedValue(undefined)
  })

  const RUTAS: Array<[string, Metodo, string, number, jest.Mock, object?]> = [
    ['GET /root/duenos', 'get', '/root/duenos', 200, duenos.listar],
    ['POST /root/marcas/:id/duenos', 'post', '/root/marcas/m-001/duenos', 201, duenos.crear, { email: 'juan@laparrilla.com' }],
    ['PATCH /root/duenos/:id', 'patch', '/root/duenos/owner-1', 200, duenos.cambiarEmail, { email: 'nuevo@laparrilla.com' }],
    ['POST /root/duenos/:id/restablecer-password', 'post', '/root/duenos/owner-1/restablecer-password', 200, duenos.restablecerPassword],
    ['DELETE /root/duenos/:id', 'delete', '/root/duenos/owner-1', 204, duenos.eliminar],
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
    it('POST /root/marcas/:id/duenos: el id de la marca (aunque no sea UUID), el email y el usuario ROOT', async () => {
      await api.pedir('post', '/root/marcas/m-001/duenos', { cuenta: CUENTAS.ROOT, body: { email: 'juan@laparrilla.com' } })

      expect(duenos.crear).toHaveBeenCalledWith('m-001', { email: 'juan@laparrilla.com' }, CUENTAS.ROOT)
    })

    it('el email se normaliza: sin espacios y en minúsculas', async () => {
      await api.pedir('post', '/root/marcas/m-001/duenos', { cuenta: CUENTAS.ROOT, body: { email: '  Juan@LaParrilla.COM ' } })

      expect(duenos.crear).toHaveBeenCalledWith('m-001', { email: 'juan@laparrilla.com' }, CUENTAS.ROOT)
    })

    it('una contraseña elegida llega al servicio', async () => {
      await api.pedir('post', '/root/marcas/m-001/duenos', {
        cuenta: CUENTAS.ROOT,
        body: { email: 'juan@laparrilla.com', password: 'Caracol-Violeta-48' },
      })

      expect(duenos.crear).toHaveBeenCalledWith('m-001', { email: 'juan@laparrilla.com', password: 'Caracol-Violeta-48' }, CUENTAS.ROOT)
    })

    it('se descartan los campos de más: no se puede mandar el rol, la marca ni el hash por el body', async () => {
      await api.pedir('post', '/root/marcas/m-001/duenos', {
        cuenta: CUENTAS.ROOT,
        body: { email: 'juan@laparrilla.com', rol: 'ROOT', marcaId: 'otra', passwordHash: 'x', debeCambiarPassword: false, nombre: 'Juan' },
      })

      expect(duenos.crear).toHaveBeenCalledWith('m-001', { email: 'juan@laparrilla.com' }, CUENTAS.ROOT)
    })

    it('PATCH: solo el email, y se descartan los campos de más', async () => {
      await api.pedir('patch', '/root/duenos/owner-1', {
        cuenta: CUENTAS.ROOT,
        body: { email: 'nuevo@laparrilla.com', password: 'otra', rol: 'ROOT' },
      })

      expect(duenos.cambiarEmail).toHaveBeenCalledWith('owner-1', { email: 'nuevo@laparrilla.com' }, CUENTAS.ROOT)
    })

    it('GET con q: llega recortada', async () => {
      await api.pedir('get', '/root/duenos', { cuenta: CUENTAS.ROOT, query: { q: '  fiore ' } })

      expect(duenos.listar).toHaveBeenCalledWith({ q: 'fiore' })
    })

    it('restablecer y eliminar llevan el id y el usuario', async () => {
      await api.pedir('post', '/root/duenos/owner-1/restablecer-password', { cuenta: CUENTAS.ROOT })
      await api.pedir('delete', '/root/duenos/owner-1', { cuenta: CUENTAS.ROOT })

      expect(duenos.restablecerPassword).toHaveBeenCalledWith('owner-1', CUENTAS.ROOT)
      expect(duenos.eliminar).toHaveBeenCalledWith('owner-1', CUENTAS.ROOT)
    })
  })

  describe('validación', () => {
    it.each([
      ['un email inválido', { email: 'no-es-email' }],
      ['sin email', {}],
      ['un email vacío', { email: '' }],
      ['un email larguísimo', { email: `${'a'.repeat(250)}@ejemplo.com` }],
      ['una contraseña que no es texto', { email: 'juan@laparrilla.com', password: 12345678901234 }],
    ])('POST con %s responde 400', async (_caso, body) => {
      const res = await api.pedir('post', '/root/marcas/m-001/duenos', { cuenta: CUENTAS.ROOT, body })

      expect(res.status).toBe(400)
      expect(duenos.crear).not.toHaveBeenCalled()
    })

    it('PATCH sin email o con uno inválido responde 400', async () => {
      const sin = await api.pedir('patch', '/root/duenos/owner-1', { cuenta: CUENTAS.ROOT, body: {} })
      const mal = await api.pedir('patch', '/root/duenos/owner-1', { cuenta: CUENTAS.ROOT, body: { email: 'no-es-email' } })

      expect([sin.status, mal.status]).toEqual([400, 400])
      expect(duenos.cambiarEmail).not.toHaveBeenCalled()
    })

    it('GET con una q de más de 100 caracteres o con el carácter nulo responde 400', async () => {
      const larga = await api.pedir('get', '/root/duenos', { cuenta: CUENTAS.ROOT, query: { q: 'a'.repeat(101) } })
      const nula = await api.pedir('get', '/root/duenos', { cuenta: CUENTAS.ROOT, query: { q: 'a\u0000b' } })

      expect([larga.status, nula.status]).toEqual([400, 400])
      expect(duenos.listar).not.toHaveBeenCalled()
    })

    it.each([
      ['/root/duenos/a.b', 'patch'],
      ['/root/duenos/a%20b', 'delete'],
      ['/root/duenos/%00', 'delete'],
      ['/root/marcas/a.b/duenos', 'post'],
    ] as const)('un id con forma de no-id (%s) responde 404 sin llegar al servicio', async (ruta, metodo) => {
      const res = await api.pedir(metodo, ruta, { cuenta: CUENTAS.ROOT, body: { email: 'juan@laparrilla.com' } })

      expect(res.status).toBe(404)
      expect(duenos.crear).not.toHaveBeenCalled()
      expect(duenos.cambiarEmail).not.toHaveBeenCalled()
      expect(duenos.eliminar).not.toHaveBeenCalled()
    })
  })
})

describe('endpoints de cuentas ROOT', () => {
  let api: AppDeEndpoints
  const roots = { listar: jest.fn(), crear: jest.fn(), restablecerPassword: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RootRootsController, [{ provide: RootRootsService, useValue: roots }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    roots.listar.mockResolvedValue([])
    roots.crear.mockResolvedValue({ id: 'root-9' })
    roots.restablecerPassword.mockResolvedValue({ id: 'root-2' })
  })

  const RUTAS: Array<[string, Metodo, string, number, jest.Mock, object?]> = [
    ['GET /root/roots', 'get', '/root/roots', 200, roots.listar],
    ['POST /root/roots', 'post', '/root/roots', 201, roots.crear, { email: 'carla@ejemplo.com' }],
    ['POST /root/roots/:id/restablecer-password', 'post', '/root/roots/root-2/restablecer-password', 200, roots.restablecerPassword],
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

  it('POST /root/roots lleva el email normalizado y el usuario; descarta el rol y otros campos', async () => {
    await api.pedir('post', '/root/roots', { cuenta: CUENTAS.ROOT, body: { email: ' Carla@Ejemplo.com', rol: 'OWNER', marcaId: 'x' } })

    expect(roots.crear).toHaveBeenCalledWith({ email: 'carla@ejemplo.com' }, CUENTAS.ROOT)
  })

  it('POST /root/roots con un email inválido responde 400', async () => {
    const res = await api.pedir('post', '/root/roots', { cuenta: CUENTAS.ROOT, body: { email: 'no-es-email' } })

    expect(res.status).toBe(400)
    expect(roots.crear).not.toHaveBeenCalled()
  })

  it('restablecer lleva el id y el usuario', async () => {
    await api.pedir('post', '/root/roots/root-2/restablecer-password', { cuenta: CUENTAS.ROOT })

    expect(roots.restablecerPassword).toHaveBeenCalledWith('root-2', CUENTAS.ROOT)
  })

  it('un id con forma de no-id responde 404 sin llegar al servicio', async () => {
    const res = await api.pedir('post', '/root/roots/a.b/restablecer-password', { cuenta: CUENTAS.ROOT })

    expect(res.status).toBe(404)
    expect(roots.restablecerPassword).not.toHaveBeenCalled()
  })

  // Decisión 15: las cuentas ROOT no se borran desde la app ni la API. No hay ruta, ni siquiera para ROOT.
  it.each(['delete', 'put', 'patch'] as const)('%s /root/roots/:id no existe (404), tampoco para ROOT', async (metodo) => {
    const res = await api.pedir(metodo, '/root/roots/root-2', { cuenta: CUENTAS.ROOT, body: { email: 'x@ejemplo.com' } })

    expect(res.status).toBe(404)
  })

  it('DELETE /root/roots tampoco existe', async () => {
    const res = await api.pedir('delete', '/root/roots', { cuenta: CUENTAS.ROOT })

    expect(res.status).toBe(404)
  })
})
