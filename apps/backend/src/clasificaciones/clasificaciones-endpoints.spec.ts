import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, SIN_USUARIO } from '../test/app-endpoints'
import { ClasificacionesController } from './clasificaciones.controller'
import { ClasificacionesService } from './clasificaciones.service'

const CLAS_ID = '6f1c2a40-2222-4a1b-9c3d-000000000002'

// El rol (en algún restaurante para el catálogo, en el del ítem para asignar) lo pide el service: ver su spec.
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

  it('GET /clasificaciones es público: responde sin token', async () => {
    // Arrange
    clasificaciones.findAll.mockResolvedValue([{ id: CLAS_ID, nombre: 'Vegano' }])

    // Act
    const res = await api.pedir('get', '/clasificaciones', { query: { restauranteId: 'rest-1' } })

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: CLAS_ID, nombre: 'Vegano' }])
    expect(clasificaciones.findAll).toHaveBeenCalledWith('rest-1')
  })

  it('POST /clasificaciones pasa solo el nombre y la cuenta al service (201)', async () => {
    // Arrange
    clasificaciones.create.mockResolvedValue({ id: CLAS_ID })

    // Act
    const res = await api.pedir('post', '/clasificaciones', { cuenta: CUENTAS.OWNER_A, body: { nombre: 'Vegano' } })

    // Assert
    expect(res.status).toBe(201)
    expect(clasificaciones.create).toHaveBeenCalledWith('Vegano', CUENTAS.OWNER_A)
  })

  it.each([
    ['POST sin token', 'post', '/clasificaciones', undefined, 401],
    ['POST con nombre vacío', 'post', '/clasificaciones', CUENTAS.OWNER_A, 400],
    ['PATCH de una cuenta de Supabase sin Usuario', 'patch', `/clasificaciones/${CLAS_ID}`, SIN_USUARIO, 403],
  ] as const)('%s responde %i', async (_caso, metodo, ruta, cuenta, estado) => {
    // Act
    const res = await api.pedir(metodo, ruta, { cuenta, body: { nombre: '' } })

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
    const cambio = await api.pedir('patch', `/clasificaciones/${CLAS_ID}`, { cuenta: CUENTAS.GERENTE, body: { nombre: 'Vegana' } })
    const baja = await api.pedir('delete', `/clasificaciones/${CLAS_ID}`, { cuenta: CUENTAS.GERENTE })

    // Assert
    expect(cambio.status).toBe(200)
    expect(clasificaciones.update).toHaveBeenCalledWith(CLAS_ID, 'Vegana', CUENTAS.GERENTE)
    expect(baja.status).toBe(204)
    expect(clasificaciones.remove).toHaveBeenCalledWith(CLAS_ID, CUENTAS.GERENTE)
  })

  describe('asignación a ítems', () => {
    it('POST /clasificaciones/items/:itemId asigna con el id del body (201)', async () => {
      // Arrange
      clasificaciones.addToItem.mockResolvedValue({ id: 'item-1' })

      // Act
      const res = await api.pedir('post', '/clasificaciones/items/item-1', { cuenta: CUENTAS.OWNER_A, body: { clasificacionId: CLAS_ID } })

      // Assert
      expect(res.status).toBe(201)
      expect(clasificaciones.addToItem).toHaveBeenCalledWith('item-1', CLAS_ID, CUENTAS.OWNER_A)
    })

    it('POST con un clasificacionId que no es UUID responde 400', async () => {
      // Act
      const res = await api.pedir('post', '/clasificaciones/items/item-1', { cuenta: CUENTAS.OWNER_A, body: { clasificacionId: 'vegano' } })

      // Assert
      expect(res.status).toBe(400)
      expect(clasificaciones.addToItem).not.toHaveBeenCalled()
    })

    it('DELETE /clasificaciones/items/:itemId/:clasificacionId desasigna (204)', async () => {
      // Arrange
      clasificaciones.removeFromItem.mockResolvedValue(undefined)

      // Act
      const res = await api.pedir('delete', `/clasificaciones/items/item-1/${CLAS_ID}`, { cuenta: CUENTAS.OWNER_A })

      // Assert
      expect(res.status).toBe(204)
      expect(clasificaciones.removeFromItem).toHaveBeenCalledWith('item-1', CLAS_ID, CUENTAS.OWNER_A)
    })

    it('sin token, 401', async () => {
      // Act
      const res = await api.pedir('delete', `/clasificaciones/items/item-1/${CLAS_ID}`)

      // Assert
      expect(res.status).toBe(401)
      expect(clasificaciones.removeFromItem).not.toHaveBeenCalled()
    })
  })
})
