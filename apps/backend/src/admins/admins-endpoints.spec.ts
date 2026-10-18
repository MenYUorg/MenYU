import { AppDeEndpoints, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { AdminRestauranteController } from '../admin-restaurante/admin-restaurante.controller'
import { AdminRestauranteService } from '../admin-restaurante/admin-restaurante.service'
import { AdminsController } from './admins.controller'
import { AdminsService } from './admins.service'

const ALTA = { email: 'gerente@menyu.test', nombre: 'Gerente', password: 'clave-segura' }

describe('endpoints de admins', () => {
  let api: AppDeEndpoints
  const admins = { create: jest.fn(), findAll: jest.fn(), update: jest.fn(), remove: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(AdminsController, [{ provide: AdminsService, useValue: admins }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  it('POST /admins: el OWNER crea un admin (201)', async () => {
    // Arrange
    admins.create.mockResolvedValue({ id: 'admin-1', email: ALTA.email, rol: 'GERENTE' })

    // Act
    const res = await api.pedir('post', '/admins', { usuario: USUARIOS.OWNER, body: ALTA })

    // Assert
    expect(res.status).toBe(201)
    expect(admins.create).toHaveBeenCalledWith(ALTA, USUARIOS.OWNER)
  })

  it.each([
    ['un email inválido', { ...ALTA, email: 'no-es-email' }],
    ['una contraseña corta', { ...ALTA, password: 'corta' }],
    ['sin nombre', { email: ALTA.email, password: ALTA.password }],
  ])('POST /admins con %s responde 400', async (_caso, body) => {
    // Act
    const res = await api.pedir('post', '/admins', { usuario: USUARIOS.OWNER, body })

    // Assert
    expect(res.status).toBe(400)
    expect(admins.create).not.toHaveBeenCalled()
  })

  it('un GERENTE no accede a /admins (403)', async () => {
    // Act
    const res = await api.pedir('get', '/admins', { usuario: USUARIOS.GERENTE })

    // Assert
    expect(res.status).toBe(403)
    expect(admins.findAll).not.toHaveBeenCalled()
  })

  it('GET, PATCH y DELETE delegan con el usuario; DELETE responde 204', async () => {
    // Arrange
    admins.findAll.mockResolvedValue([])
    admins.update.mockResolvedValue({ id: 'admin-1' })
    admins.remove.mockResolvedValue(undefined)

    // Act
    await api.pedir('get', '/admins', { usuario: USUARIOS.OWNER })
    await api.pedir('patch', '/admins/admin-1', { usuario: USUARIOS.OWNER, body: { email: 'nuevo@menyu.test' } })
    const baja = await api.pedir('delete', '/admins/admin-1', { usuario: USUARIOS.OWNER })

    // Assert
    expect(admins.findAll).toHaveBeenCalledWith(USUARIOS.OWNER)
    expect(admins.update).toHaveBeenCalledWith('admin-1', { email: 'nuevo@menyu.test' }, USUARIOS.OWNER)
    expect(baja.status).toBe(204)
  })
})

describe('endpoints de admin-restaurante', () => {
  let api: AppDeEndpoints
  const service = { asignar: jest.fn(), desasignar: jest.fn(), findByAdmin: jest.fn(), findGerentesByMarca: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(AdminRestauranteController, [{ provide: AdminRestauranteService, useValue: service }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  it('POST /admin-restaurante asigna con los ids del body (201)', async () => {
    // Arrange
    service.asignar.mockResolvedValue({ adminId: 'gerente-1', restauranteId: 'rest-1' })

    // Act
    const res = await api.pedir('post', '/admin-restaurante', {
      usuario: USUARIOS.OWNER,
      body: { adminId: 'gerente-1', restauranteId: 'rest-1' },
    })

    // Assert
    expect(res.status).toBe(201)
    expect(service.asignar).toHaveBeenCalledWith('gerente-1', 'rest-1', USUARIOS.OWNER)
  })

  it('DELETE /admin-restaurante/:adminId/:restauranteId desasigna (204)', async () => {
    // Arrange
    service.desasignar.mockResolvedValue(undefined)

    // Act
    const res = await api.pedir('delete', '/admin-restaurante/gerente-1/rest-1', { usuario: USUARIOS.OWNER })

    // Assert
    expect(res.status).toBe(204)
    expect(service.desasignar).toHaveBeenCalledWith('gerente-1', 'rest-1', USUARIOS.OWNER)
  })

  it('GET por admin y por marca delegan con el parámetro correspondiente', async () => {
    // Arrange
    service.findByAdmin.mockResolvedValue([])
    service.findGerentesByMarca.mockResolvedValue([])

    // Act
    await api.pedir('get', '/admin-restaurante/gerente-1', { usuario: USUARIOS.OWNER })
    await api.pedir('get', '/admin-restaurante', { usuario: USUARIOS.OWNER, query: { marcaId: 'marca-1' } })

    // Assert
    expect(service.findByAdmin).toHaveBeenCalledWith('gerente-1', USUARIOS.OWNER)
    expect(service.findGerentesByMarca).toHaveBeenCalledWith('marca-1', USUARIOS.OWNER)
  })

  it('un GERENTE no puede gestionar asignaciones (403)', async () => {
    // Act
    const res = await api.pedir('post', '/admin-restaurante', {
      usuario: USUARIOS.GERENTE,
      body: { adminId: 'gerente-1', restauranteId: 'rest-1' },
    })

    // Assert
    expect(res.status).toBe(403)
    expect(service.asignar).not.toHaveBeenCalled()
  })
})
