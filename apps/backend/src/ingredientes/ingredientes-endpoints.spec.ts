import { AppDeEndpoints, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { IngredientesController } from './ingredientes.controller'
import { IngredientesService } from './ingredientes.service'

const REST_ID = '6f1c2a40-1111-4a1b-9c3d-000000000001'

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
    const res = await api.pedir('post', '/ingredientes', { usuario: USUARIOS.OWNER, body })

    // Assert
    expect(res.status).toBe(201)
    expect(ingredientes.create).toHaveBeenCalledWith(body, USUARIOS.OWNER)
  })

  it('POST /ingredientes con esAlergeno que no es booleano responde 400', async () => {
    // Act
    const res = await api.pedir('post', '/ingredientes', {
      usuario: USUARIOS.OWNER,
      body: { nombre: 'Maní', restauranteId: REST_ID, esAlergeno: 'sí' },
    })

    // Assert
    expect(res.status).toBe(400)
    expect(ingredientes.create).not.toHaveBeenCalled()
  })

  it('GET, PATCH y DELETE delegan con el id de la ruta; DELETE responde 204', async () => {
    // Arrange
    ingredientes.findAll.mockResolvedValue([])
    ingredientes.findOne.mockResolvedValue({ id: 'ing-1' })
    ingredientes.update.mockResolvedValue({ id: 'ing-1' })
    ingredientes.remove.mockResolvedValue(undefined)

    // Act
    await api.pedir('get', '/ingredientes', { usuario: USUARIOS.GERENTE, query: { restauranteId: REST_ID } })
    await api.pedir('get', '/ingredientes/ing-1', { usuario: USUARIOS.GERENTE })
    await api.pedir('patch', '/ingredientes/ing-1', { usuario: USUARIOS.GERENTE, body: { nombre: 'Maní tostado' } })
    const baja = await api.pedir('delete', '/ingredientes/ing-1', { usuario: USUARIOS.GERENTE })

    // Assert
    expect(ingredientes.findAll).toHaveBeenCalledWith(REST_ID, USUARIOS.GERENTE)
    expect(ingredientes.findOne).toHaveBeenCalledWith('ing-1', USUARIOS.GERENTE)
    expect(ingredientes.update).toHaveBeenCalledWith('ing-1', { nombre: 'Maní tostado' }, USUARIOS.GERENTE)
    expect(baja.status).toBe(204)
  })

  it('un JWT de comensal no accede (403)', async () => {
    // Act
    const res = await api.pedir('get', '/ingredientes/ing-1', { usuario: USUARIOS.CLIENTE })

    // Assert
    expect(res.status).toBe(403)
    expect(ingredientes.findOne).not.toHaveBeenCalled()
  })
})
