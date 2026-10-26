import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { PersonalController } from './personal.controller'
import { PersonalService } from './personal.service'

// OWNER o GERENTE del restaurante de la ruta. A quién le puede quitar el acceso cada uno, en personal.service.spec.
describe('endpoints de Personal', () => {
  let api: AppDeEndpoints
  const personal = { listar: jest.fn(), quitarAcceso: jest.fn() }
  const REST = MUNDO.REST_1
  const VACIO = { duenos: [], miembros: [], sinCuenta: [] }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(PersonalController, [{ provide: PersonalService, useValue: personal }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    personal.listar.mockResolvedValue(VACIO)
    personal.quitarAcceso.mockResolvedValue(undefined)
  })

  it.each([
    ['el OWNER de la marca', CUENTAS.OWNER_A, REST],
    ['el OWNER de la marca, en otra sucursal', CUENTAS.OWNER_A, MUNDO.REST_2],
    ['el GERENTE del restaurante', CUENTAS.GERENTE, REST],
  ])('%s ve el personal y puede quitar acceso', async (_caso, cuenta, restauranteId) => {
    const lista = await api.pedir('get', `/restaurantes/${restauranteId}/personal`, { cuenta })
    const baja = await api.pedir('delete', `/restaurantes/${restauranteId}/personal/m-1`, { cuenta })

    expect(lista.status).toBe(200)
    expect(lista.body).toEqual(VACIO)
    expect(personal.listar).toHaveBeenCalledWith(restauranteId)
    expect(baja.status).toBe(204)
    expect(personal.quitarAcceso).toHaveBeenCalledWith(restauranteId, 'm-1', cuenta)
  })

  it.each([
    ['ROOT (no es un bypass)', CUENTAS.ROOT, REST],
    ['el OWNER de otra marca', CUENTAS.OWNER_B, REST],
    ['el GERENTE en otra sucursal', CUENTAS.GERENTE, MUNDO.REST_2],
    ['el JEFE_SALON', CUENTAS.JEFE_SALON, REST],
    ['el MOZO', CUENTAS.MOZO, REST],
    ['la COCINA', CUENTAS.COCINA, REST],
  ])('%s recibe 403', async (_caso, cuenta, restauranteId) => {
    const lista = await api.pedir('get', `/restaurantes/${restauranteId}/personal`, { cuenta })
    const baja = await api.pedir('delete', `/restaurantes/${restauranteId}/personal/m-1`, { cuenta })

    expect([lista.status, baja.status]).toEqual([403, 403])
    expect(personal.listar).not.toHaveBeenCalled()
    expect(personal.quitarAcceso).not.toHaveBeenCalled()
  })

  it('sin token 401 y sin Usuario 403', async () => {
    const anonimo = await api.pedir('get', `/restaurantes/${REST}/personal`)
    const sinUsuario = await api.pedir('delete', `/restaurantes/${REST}/personal/m-1`, { cuenta: SIN_USUARIO })

    expect([anonimo.status, sinUsuario.status]).toEqual([401, 403])
  })
})
