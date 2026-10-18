import { AppDeEndpoints, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { CategoriasController } from './categorias.controller'
import { CategoriasService } from './categorias.service'

const REST_ID = '6f1c2a40-1111-4a1b-9c3d-000000000001'

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
    const res = await api.pedir('post', '/categorias', { usuario: USUARIOS.GERENTE, body })

    // Assert
    expect(res.status).toBe(201)
    expect(categorias.create).toHaveBeenCalledWith(body, USUARIOS.GERENTE)
  })

  it.each([
    ['sin nombre', { restauranteId: REST_ID }],
    ['con orden negativo', { nombre: 'Entradas', restauranteId: REST_ID, orden: -1 }],
  ])('POST /categorias %s responde 400', async (_caso, body) => {
    // Act
    const res = await api.pedir('post', '/categorias', { usuario: USUARIOS.OWNER, body })

    // Assert
    expect(res.status).toBe(400)
    expect(categorias.create).not.toHaveBeenCalled()
  })

  it('GET /categorias y GET /categorias/:id delegan con la query y el id', async () => {
    // Arrange
    categorias.findAll.mockResolvedValue([])
    categorias.findOne.mockResolvedValue({ id: 'cat-1' })

    // Act
    await api.pedir('get', '/categorias', { usuario: USUARIOS.OWNER, query: { restauranteId: REST_ID } })
    const res = await api.pedir('get', '/categorias/cat-1', { usuario: USUARIOS.OWNER })

    // Assert
    expect(categorias.findAll).toHaveBeenCalledWith(REST_ID, USUARIOS.OWNER)
    expect(res.body).toEqual({ id: 'cat-1' })
  })

  it('PATCH /categorias/:id actualiza', async () => {
    // Arrange
    categorias.update.mockResolvedValue({ id: 'cat-1', nombre: 'Postres' })

    // Act
    const res = await api.pedir('patch', '/categorias/cat-1', { usuario: USUARIOS.GERENTE, body: { nombre: 'Postres' } })

    // Assert
    expect(res.status).toBe(200)
    expect(categorias.update).toHaveBeenCalledWith('cat-1', { nombre: 'Postres' }, USUARIOS.GERENTE)
  })

  it('DELETE /categorias/:id: el OWNER borra (204) y un GERENTE no puede (403)', async () => {
    // Arrange
    categorias.remove.mockResolvedValue(undefined)

    // Act
    const owner = await api.pedir('delete', '/categorias/cat-1', { usuario: USUARIOS.OWNER })
    const gerente = await api.pedir('delete', '/categorias/cat-1', { usuario: USUARIOS.GERENTE })

    // Assert
    expect(owner.status).toBe(204)
    expect(gerente.status).toBe(403)
    expect(categorias.remove).toHaveBeenCalledTimes(1)
  })

  it('un mozo no accede a categorías (403) y sin JWT responde 401', async () => {
    // Act
    const mozo = await api.pedir('get', '/categorias', { usuario: USUARIOS.MOZO, query: { restauranteId: REST_ID } })
    const anonimo = await api.pedir('get', '/categorias', { query: { restauranteId: REST_ID } })

    // Assert
    expect(mozo.status).toBe(403)
    expect(anonimo.status).toBe(401)
    expect(categorias.findAll).not.toHaveBeenCalled()
  })
})
