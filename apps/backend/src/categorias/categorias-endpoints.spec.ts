import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { CategoriasController } from './categorias.controller'
import { CategoriasService } from './categorias.service'

const REST_ID = MUNDO.REST_1

describe('endpoints de categorías', () => {
  let api: AppDeEndpoints
  const categorias = { create: jest.fn(), findAll: jest.fn(), findOne: jest.fn(), update: jest.fn(), remove: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(CategoriasController, [{ provide: CategoriasService, useValue: categorias }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  it('POST /categorias: un GERENTE crea una categoría (201)', async () => {
    // Arrange
    categorias.create.mockResolvedValue({ id: 'cat-1' })
    const body = { nombre: 'Entradas', restauranteId: REST_ID, orden: 1 }

    // Act
    const res = await api.pedir('post', '/categorias', { cuenta: CUENTAS.GERENTE, body })

    // Assert
    expect(res.status).toBe(201)
    expect(categorias.create).toHaveBeenCalledWith(body)
  })

  it.each([
    ['sin nombre', { restauranteId: REST_ID }],
    ['con orden negativo', { nombre: 'Entradas', restauranteId: REST_ID, orden: -1 }],
  ])('POST /categorias %s responde 400', async (_caso, body) => {
    // Act
    const res = await api.pedir('post', '/categorias', { cuenta: CUENTAS.OWNER_A, body })

    // Assert
    expect(res.status).toBe(400)
    expect(categorias.create).not.toHaveBeenCalled()
  })

  it.each([
    ['ROOT', CUENTAS.ROOT],
    ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ['el JEFE_SALON', CUENTAS.JEFE_SALON],
  ])('POST /categorias: %s recibe 403', async (_caso, cuenta) => {
    // Act
    const res = await api.pedir('post', '/categorias', { cuenta, body: { nombre: 'Entradas', restauranteId: REST_ID } })

    // Assert
    expect(res.status).toBe(403)
    expect(categorias.create).not.toHaveBeenCalled()
  })

  it('GET /categorias y GET /categorias/:id delegan con la query, el id y la cuenta', async () => {
    // Arrange
    categorias.findAll.mockResolvedValue([])
    categorias.findOne.mockResolvedValue({ id: 'cat-1' })

    // Act
    await api.pedir('get', '/categorias', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: REST_ID } })
    const res = await api.pedir('get', '/categorias/cat-1', { cuenta: CUENTAS.OWNER_A })

    // Assert
    expect(categorias.findAll).toHaveBeenCalledWith(REST_ID)
    expect(categorias.findOne).toHaveBeenCalledWith('cat-1', CUENTAS.OWNER_A)
    expect(res.body).toEqual({ id: 'cat-1' })
  })

  it('PATCH /categorias/:id actualiza', async () => {
    // Arrange
    categorias.update.mockResolvedValue({ id: 'cat-1', nombre: 'Postres' })

    // Act
    const res = await api.pedir('patch', '/categorias/cat-1', { cuenta: CUENTAS.GERENTE, body: { nombre: 'Postres' } })

    // Assert
    expect(res.status).toBe(200)
    expect(categorias.update).toHaveBeenCalledWith('cat-1', { nombre: 'Postres' }, CUENTAS.GERENTE)
  })

  it('DELETE /categorias/:id: le pasa la cuenta al service, que exige OWNER (204)', async () => {
    // Arrange
    categorias.remove.mockResolvedValue(undefined)

    // Act
    const res = await api.pedir('delete', '/categorias/cat-1', { cuenta: CUENTAS.OWNER_A })

    // Assert
    expect(res.status).toBe(204)
    expect(categorias.remove).toHaveBeenCalledWith('cat-1', CUENTAS.OWNER_A)
  })

  it('un mozo no lista categorías (403), sin token responde 401 y sin Usuario 403', async () => {
    // Act
    const mozo = await api.pedir('get', '/categorias', { cuenta: CUENTAS.MOZO, query: { restauranteId: REST_ID } })
    const anonimo = await api.pedir('get', '/categorias', { query: { restauranteId: REST_ID } })
    const sinUsuario = await api.pedir('get', '/categorias/cat-1', { cuenta: SIN_USUARIO })

    // Assert
    expect(mozo.status).toBe(403)
    expect(anonimo.status).toBe(401)
    expect(sinUsuario.status).toBe(403)
    expect(categorias.findAll).not.toHaveBeenCalled()
    expect(categorias.findOne).not.toHaveBeenCalled()
  })
})
