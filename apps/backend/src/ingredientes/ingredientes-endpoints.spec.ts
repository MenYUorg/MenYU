import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { IngredientesController } from './ingredientes.controller'
import { IngredientesService } from './ingredientes.service'

const REST_ID = MUNDO.REST_1

describe('endpoints de ingredientes', () => {
  let api: AppDeEndpoints
  const ingredientes = { create: jest.fn(), findAll: jest.fn(), findOne: jest.fn(), update: jest.fn(), remove: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(IngredientesController, [{ provide: IngredientesService, useValue: ingredientes }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  it('POST /ingredientes crea un ingrediente (201) con el body validado', async () => {
    // Arrange
    ingredientes.create.mockResolvedValue({ id: 'ing-1' })
    const body = { nombre: 'Maní', restauranteId: REST_ID, esAlergeno: true }

    // Act
    const res = await api.pedir('post', '/ingredientes', { cuenta: CUENTAS.OWNER_A, body })

    // Assert
    expect(res.status).toBe(201)
    expect(ingredientes.create).toHaveBeenCalledWith(body)
  })

  it('POST /ingredientes con esAlergeno que no es booleano responde 400', async () => {
    // Act
    const res = await api.pedir('post', '/ingredientes', {
      cuenta: CUENTAS.OWNER_A,
      body: { nombre: 'Maní', restauranteId: REST_ID, esAlergeno: 'sí' },
    })

    // Assert
    expect(res.status).toBe(400)
    expect(ingredientes.create).not.toHaveBeenCalled()
  })

  it.each([
    ['ROOT', CUENTAS.ROOT],
    ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ['el MOZO', CUENTAS.MOZO],
  ])('POST y GET /ingredientes: %s recibe 403', async (_caso, cuenta) => {
    // Act
    const alta = await api.pedir('post', '/ingredientes', { cuenta, body: { nombre: 'Maní', restauranteId: REST_ID } })
    const lista = await api.pedir('get', '/ingredientes', { cuenta, query: { restauranteId: REST_ID } })

    // Assert
    expect([alta.status, lista.status]).toEqual([403, 403])
    expect(ingredientes.create).not.toHaveBeenCalled()
    expect(ingredientes.findAll).not.toHaveBeenCalled()
  })

  it('GET, PATCH y DELETE delegan con el id de la ruta y la cuenta; DELETE responde 204', async () => {
    // Arrange
    ingredientes.findAll.mockResolvedValue([])
    ingredientes.findOne.mockResolvedValue({ id: 'ing-1' })
    ingredientes.update.mockResolvedValue({ id: 'ing-1' })
    ingredientes.remove.mockResolvedValue(undefined)

    // Act
    await api.pedir('get', '/ingredientes', { cuenta: CUENTAS.GERENTE, query: { restauranteId: REST_ID } })
    await api.pedir('get', '/ingredientes/ing-1', { cuenta: CUENTAS.GERENTE })
    await api.pedir('patch', '/ingredientes/ing-1', { cuenta: CUENTAS.GERENTE, body: { nombre: 'Maní tostado' } })
    const baja = await api.pedir('delete', '/ingredientes/ing-1', { cuenta: CUENTAS.GERENTE })

    // Assert
    expect(ingredientes.findAll).toHaveBeenCalledWith(REST_ID)
    expect(ingredientes.findOne).toHaveBeenCalledWith('ing-1', CUENTAS.GERENTE)
    expect(ingredientes.update).toHaveBeenCalledWith('ing-1', { nombre: 'Maní tostado' }, CUENTAS.GERENTE)
    expect(ingredientes.remove).toHaveBeenCalledWith('ing-1', CUENTAS.GERENTE)
    expect(baja.status).toBe(204)
  })

  it('las rutas de un ingrediente: sin token 401 y sin Usuario 403', async () => {
    // Act
    const anonimo = await api.pedir('get', '/ingredientes/ing-1')
    const sinUsuario = await api.pedir('delete', '/ingredientes/ing-1', { cuenta: SIN_USUARIO })

    // Assert
    expect(anonimo.status).toBe(401)
    expect(sinUsuario.status).toBe(403)
    expect(ingredientes.findOne).not.toHaveBeenCalled()
    expect(ingredientes.remove).not.toHaveBeenCalled()
  })
})
