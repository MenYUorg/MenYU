import { AppDeEndpoints, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { ClasificacionesController } from './clasificaciones.controller'
import { ClasificacionesService } from './clasificaciones.service'

const CLAS_ID = '6f1c2a40-2222-4a1b-9c3d-000000000002'

describe('endpoints de clasificaciones', () => {
  let api: AppDeEndpoints
  const clasificaciones = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    addToItem: jest.fn(),
    removeFromItem: jest.fn(),
  }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(ClasificacionesController, [
      { provide: ClasificacionesService, useValue: clasificaciones },
    ])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  it('GET /clasificaciones es público: responde sin JWT', async () => {
    // Arrange
    clasificaciones.findAll.mockResolvedValue([{ id: CLAS_ID, nombre: 'Vegano' }])

    // Act
    const res = await api.pedir('get', '/clasificaciones', { query: { restauranteId: 'rest-1' } })

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: CLAS_ID, nombre: 'Vegano' }])
    expect(clasificaciones.findAll).toHaveBeenCalledWith('rest-1')
  })

  it('POST /clasificaciones pasa solo el nombre al service (201)', async () => {
    // Arrange
    clasificaciones.create.mockResolvedValue({ id: CLAS_ID })

    // Act
    const res = await api.pedir('post', '/clasificaciones', { usuario: USUARIOS.OWNER, body: { nombre: 'Vegano' } })

    // Assert
    expect(res.status).toBe(201)
    expect(clasificaciones.create).toHaveBeenCalledWith('Vegano', USUARIOS.OWNER)
  })

  it.each([
    ['POST sin JWT', 'post', '/clasificaciones', undefined, 401],
    ['POST con nombre vacío', 'post', '/clasificaciones', USUARIOS.OWNER, 400],
    ['PATCH de un mozo', 'patch', `/clasificaciones/${CLAS_ID}`, USUARIOS.MOZO, 403],
  ] as const)('%s responde %i', async (_caso, metodo, ruta, usuario, estado) => {
    // Act
    const res = await api.pedir(metodo, ruta, { usuario, body: { nombre: '' } })

    // Assert
    expect(res.status).toBe(estado)
    expect(clasificaciones.create).not.toHaveBeenCalled()
    expect(clasificaciones.update).not.toHaveBeenCalled()
  })

  it('PATCH y DELETE /clasificaciones/:id delegan; DELETE responde 204', async () => {
    // Arrange
    clasificaciones.update.mockResolvedValue({ id: CLAS_ID, nombre: 'Vegana' })
    clasificaciones.remove.mockResolvedValue(undefined)

    // Act
    const cambio = await api.pedir('patch', `/clasificaciones/${CLAS_ID}`, { usuario: USUARIOS.GERENTE, body: { nombre: 'Vegana' } })
    const baja = await api.pedir('delete', `/clasificaciones/${CLAS_ID}`, { usuario: USUARIOS.GERENTE })

    // Assert
    expect(cambio.status).toBe(200)
    expect(clasificaciones.update).toHaveBeenCalledWith(CLAS_ID, 'Vegana', USUARIOS.GERENTE)
    expect(baja.status).toBe(204)
    expect(clasificaciones.remove).toHaveBeenCalledWith(CLAS_ID, USUARIOS.GERENTE)
  })

  describe('asignación a ítems', () => {
    it('POST /clasificaciones/items/:itemId asigna con el id del body (201)', async () => {
      // Arrange
      clasificaciones.addToItem.mockResolvedValue({ id: 'item-1' })

      // Act
      const res = await api.pedir('post', '/clasificaciones/items/item-1', { usuario: USUARIOS.OWNER, body: { clasificacionId: CLAS_ID } })

      // Assert
      expect(res.status).toBe(201)
      expect(clasificaciones.addToItem).toHaveBeenCalledWith('item-1', CLAS_ID, USUARIOS.OWNER)
    })

    it('POST con un clasificacionId que no es UUID responde 400', async () => {
      // Act
      const res = await api.pedir('post', '/clasificaciones/items/item-1', { usuario: USUARIOS.OWNER, body: { clasificacionId: 'vegano' } })

      // Assert
      expect(res.status).toBe(400)
      expect(clasificaciones.addToItem).not.toHaveBeenCalled()
    })

    it('DELETE /clasificaciones/items/:itemId/:clasificacionId desasigna (204)', async () => {
      // Arrange
      clasificaciones.removeFromItem.mockResolvedValue(undefined)

      // Act
      const res = await api.pedir('delete', `/clasificaciones/items/item-1/${CLAS_ID}`, { usuario: USUARIOS.OWNER })

      // Assert
      expect(res.status).toBe(204)
      expect(clasificaciones.removeFromItem).toHaveBeenCalledWith('item-1', CLAS_ID, USUARIOS.OWNER)
    })
  })
})
