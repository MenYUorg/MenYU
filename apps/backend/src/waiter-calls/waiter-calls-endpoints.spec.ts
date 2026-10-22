import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { WaiterCallsController } from './waiter-calls.controller'
import { WaiterCallsService } from './waiter-calls.service'

// Listar los llamados lo exige la ruta (el salón del restaurante de la query); atender, el service (con el restaurante
// del llamado). Llamar es del comensal: el service verifica el token de su sesión de mesa (waiter-calls.service.spec).
describe('endpoints de llamados al mozo', () => {
  let api: AppDeEndpoints
  const llamados = { findByRestaurante: jest.fn(), llamar: jest.fn(), atender: jest.fn() }
  const REST = MUNDO.REST_1

  beforeAll(async () => {
    api = await crearAppDeEndpoints(WaiterCallsController, [{ provide: WaiterCallsService, useValue: llamados }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    llamados.findByRestaurante.mockResolvedValue([])
    llamados.atender.mockResolvedValue({ id: 'llamado-1', estado: 'atendido' })
    llamados.llamar.mockResolvedValue({ ok: true })
  })

  describe('GET /waiter-calls', () => {
    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el OWNER de la marca', CUENTAS.OWNER_A],
    ])('%s lista los llamados del restaurante', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/waiter-calls', { cuenta, query: { restauranteId: REST } })

      expect(res.status).toBe(200)
      expect(llamados.findByRestaurante).toHaveBeenCalledWith(REST)
    })

    it.each([
      ['la COCINA', CUENTAS.COCINA, REST],
      ['ROOT', CUENTAS.ROOT, REST],
      ['el MOZO en otro restaurante (antes no se chequeaba la pertenencia)', CUENTAS.MOZO, MUNDO.REST_2],
    ])('%s recibe 403', async (_caso, cuenta, restauranteId) => {
      const res = await api.pedir('get', '/waiter-calls', { cuenta, query: { restauranteId } })

      expect(res.status).toBe(403)
      expect(llamados.findByRestaurante).not.toHaveBeenCalled()
    })

    it('sin token 401: el token de la sesión de mesa tampoco sirve', async () => {
      const res = await api.pedir('get', '/waiter-calls', { query: { restauranteId: REST } }).set('Authorization', 'Bearer de-la-mesa')

      expect(res.status).toBe(401)
    })
  })

  describe('PATCH /waiter-calls/:id/atender', () => {
    it('le pasa la cuenta al service', async () => {
      const res = await api.pedir('patch', '/waiter-calls/llamado-1/atender', { cuenta: CUENTAS.MOZO })

      expect(res.status).toBe(200)
      expect(llamados.atender).toHaveBeenCalledWith('llamado-1', CUENTAS.MOZO)
    })

    it('sin token 401 y sin Usuario 403', async () => {
      const anonimo = await api.pedir('patch', '/waiter-calls/llamado-1/atender')
      const sinUsuario = await api.pedir('patch', '/waiter-calls/llamado-1/atender', { cuenta: SIN_USUARIO })

      expect([anonimo.status, sinUsuario.status]).toEqual([401, 403])
      expect(llamados.atender).not.toHaveBeenCalled()
    })
  })

  it('POST /waiter-calls (comensal) pasa el header Authorization tal cual', async () => {
    const res = await api
      .pedir('post', '/waiter-calls', { body: { sesionId: '6f1c2a40-0000-4a1b-9c3d-000000000001' } })
      .set('Authorization', 'Bearer de-la-mesa')

    expect(res.status).toBe(200)
    expect(llamados.llamar).toHaveBeenCalledWith({ sesionId: '6f1c2a40-0000-4a1b-9c3d-000000000001' }, 'Bearer de-la-mesa')
  })
})
