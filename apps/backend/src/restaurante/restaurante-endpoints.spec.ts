import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { RestauranteController } from './restaurante.controller'
import { RestauranteService } from './restaurante.service'

// GET y PATCH /restaurantes/:id exigen OWNER o GERENTE del restaurante de :id (la ruta). El listado lo arma el service
// con las membresías (restaurante.service.spec). El logo, en storage/logo-endpoints.spec.
describe('endpoints de restaurantes', () => {
  let api: AppDeEndpoints
  const restaurantes = { findAll: jest.fn(), findOne: jest.fn(), update: jest.fn() }
  const REST = MUNDO.REST_1

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RestauranteController, [{ provide: RestauranteService, useValue: restaurantes }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    restaurantes.findAll.mockResolvedValue([{ id: REST }])
    restaurantes.findOne.mockResolvedValue({ id: REST })
    restaurantes.update.mockResolvedValue({ id: REST })
  })

  it('GET /restaurantes le pasa la cuenta al service', async () => {
    const res = await api.pedir('get', '/restaurantes', { cuenta: CUENTAS.GERENTE })

    expect(res.status).toBe(200)
    expect(restaurantes.findAll).toHaveBeenCalledWith(CUENTAS.GERENTE)
  })

  it.each([
    ['el OWNER de la marca', CUENTAS.OWNER_A, REST],
    ['el OWNER de la marca, en otra sucursal', CUENTAS.OWNER_A, MUNDO.REST_2],
    ['el GERENTE del restaurante', CUENTAS.GERENTE, REST],
  ])('GET y PATCH /restaurantes/:id: %s pasa', async (_caso, cuenta, id) => {
    const lectura = await api.pedir('get', `/restaurantes/${id}`, { cuenta })
    const cambio = await api.pedir('patch', `/restaurantes/${id}`, { cuenta, body: { modoSesion: 'seguro' } })

    expect([lectura.status, cambio.status]).toEqual([200, 200])
    expect(restaurantes.findOne).toHaveBeenCalledWith(id)
    expect(restaurantes.update).toHaveBeenCalledWith(id, { modoSesion: 'seguro' }, cuenta)
  })

  it.each([
    ['ROOT (no es un bypass)', CUENTAS.ROOT, REST],
    ['el OWNER de otra marca', CUENTAS.OWNER_B, REST],
    ['el GERENTE en otra sucursal', CUENTAS.GERENTE, MUNDO.REST_2],
    ['el JEFE_SALON', CUENTAS.JEFE_SALON, REST],
    ['la COCINA', CUENTAS.COCINA, REST],
  ])('GET y PATCH /restaurantes/:id: %s recibe 403', async (_caso, cuenta, id) => {
    const lectura = await api.pedir('get', `/restaurantes/${id}`, { cuenta })
    const cambio = await api.pedir('patch', `/restaurantes/${id}`, { cuenta, body: { modoSesion: 'seguro' } })

    expect([lectura.status, cambio.status]).toEqual([403, 403])
    expect(restaurantes.findOne).not.toHaveBeenCalled()
    expect(restaurantes.update).not.toHaveBeenCalled()
  })

  it('PATCH con un modo de sesión que no existe: 400', async () => {
    const res = await api.pedir('patch', `/restaurantes/${REST}`, { cuenta: CUENTAS.OWNER_A, body: { modoSesion: 'otro' } })

    expect(res.status).toBe(400)
    expect(restaurantes.update).not.toHaveBeenCalled()
  })

  it('sin token 401 y sin Usuario 403', async () => {
    const anonimo = await api.pedir('get', '/restaurantes')
    const sinUsuario = await api.pedir('get', `/restaurantes/${REST}`, { cuenta: SIN_USUARIO })

    expect(anonimo.status).toBe(401)
    expect(sinUsuario.status).toBe(403)
  })

  it.each([
    ['POST /restaurantes', 'post', '/restaurantes'],
    ['DELETE /restaurantes/:id', 'delete', `/restaurantes/${REST}`],
  ] as const)('%s ya no existe (vive en /root): 404', async (_ruta, metodo, url) => {
    const res = await api.pedir(metodo, url, { cuenta: CUENTAS.OWNER_A, body: { nombre: 'Nueva' } })

    expect(res.status).toBe(404)
  })
})
