import { AppDeEndpoints, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { MozosController } from './mozos.controller'
import { MozosService } from './mozos.service'

const REST_ID = '6f1c2a40-1111-4a1b-9c3d-000000000001'
const ALTA = { restauranteId: REST_ID, nombre: 'Juan', password: 'secreta123' }

describe('endpoints de mozos', () => {
  let api: AppDeEndpoints
  const mozos = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    assignMesa: jest.fn(),
    unassignMesa: jest.fn(),
    getMesas: jest.fn(),
    llamadosHoy: jest.fn(),
  }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(MozosController, [{ provide: MozosService, useValue: mozos }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  describe('POST /mozos', () => {
    it('el OWNER da de alta un mozo: 201 y el service recibe el body y el usuario', async () => {
      // Arrange
      mozos.create.mockResolvedValue({ id: 'mozo-1', nombre: 'Juan' })

      // Act
      const res = await api.pedir('post', '/mozos', { usuario: USUARIOS.OWNER, body: ALTA })

      // Assert
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: 'mozo-1', nombre: 'Juan' })
      expect(mozos.create).toHaveBeenCalledWith(ALTA, USUARIOS.OWNER)
    })

    it('un GERENTE no puede dar de alta mozos (403)', async () => {
      // Act
      const res = await api.pedir('post', '/mozos', { usuario: USUARIOS.GERENTE, body: ALTA })

      // Assert
      expect(res.status).toBe(403)
      expect(mozos.create).not.toHaveBeenCalled()
    })

    it('sin JWT responde 401', async () => {
      // Act
      const res = await api.pedir('post', '/mozos', { body: ALTA })

      // Assert
      expect(res.status).toBe(401)
    })

    it.each([
      ['una contraseña de menos de 8 caracteres', { ...ALTA, password: 'corta' }],
      ['un restauranteId que no es UUID', { ...ALTA, restauranteId: 'rest-1' }],
      ['un email inválido', { ...ALTA, email: 'no-es-email' }],
    ])('con %s responde 400 sin llamar al service', async (_caso, body) => {
      // Act
      const res = await api.pedir('post', '/mozos', { usuario: USUARIOS.OWNER, body })

      // Assert
      expect(res.status).toBe(400)
      expect(mozos.create).not.toHaveBeenCalled()
    })
  })

  describe('lectura (OWNER y GERENTE)', () => {
    it('GET /mozos pasa el restauranteId de la query', async () => {
      // Arrange
      mozos.findAll.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/mozos', { usuario: USUARIOS.GERENTE, query: { restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(200)
      expect(mozos.findAll).toHaveBeenCalledWith(REST_ID, USUARIOS.GERENTE)
    })

    it('GET /mozos/:id devuelve el mozo', async () => {
      // Arrange
      mozos.findOne.mockResolvedValue({ id: 'mozo-1' })

      // Act
      const res = await api.pedir('get', '/mozos/mozo-1', { usuario: USUARIOS.OWNER })

      // Assert
      expect(res.body).toEqual({ id: 'mozo-1' })
      expect(mozos.findOne).toHaveBeenCalledWith('mozo-1', USUARIOS.OWNER)
    })

    it('un mozo no puede usar estos endpoints de admin (403)', async () => {
      // Act
      const res = await api.pedir('get', '/mozos', { usuario: USUARIOS.MOZO, query: { restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(403)
      expect(mozos.findAll).not.toHaveBeenCalled()
    })

    it('GET /mozos/:mozoId/mesas y /llamados-hoy delegan con el id de la ruta', async () => {
      // Arrange
      mozos.getMesas.mockResolvedValue([{ id: 'mesa-1' }])
      mozos.llamadosHoy.mockResolvedValue({ total: 3 })

      // Act
      const mesas = await api.pedir('get', '/mozos/mozo-1/mesas', { usuario: USUARIOS.OWNER })
      const llamados = await api.pedir('get', '/mozos/mozo-1/llamados-hoy', { usuario: USUARIOS.OWNER })

      // Assert
      expect(mesas.body).toEqual([{ id: 'mesa-1' }])
      expect(llamados.body).toEqual({ total: 3 })
      expect(mozos.getMesas).toHaveBeenCalledWith('mozo-1', USUARIOS.OWNER)
      expect(mozos.llamadosHoy).toHaveBeenCalledWith('mozo-1', USUARIOS.OWNER)
    })
  })

  describe('modificación y baja (solo OWNER)', () => {
    it('PATCH /mozos/:id actualiza con el body validado', async () => {
      // Arrange
      mozos.update.mockResolvedValue({ id: 'mozo-1', esJefeSalon: true })

      // Act
      const res = await api.pedir('patch', '/mozos/mozo-1', { usuario: USUARIOS.OWNER, body: { esJefeSalon: true } })

      // Assert
      expect(res.status).toBe(200)
      expect(mozos.update).toHaveBeenCalledWith('mozo-1', { esJefeSalon: true }, USUARIOS.OWNER)
    })

    it('PATCH /mozos/:id descarta campos que no están en el DTO', async () => {
      // Arrange
      mozos.update.mockResolvedValue({ id: 'mozo-1' })

      // Act
      await api.pedir('patch', '/mozos/mozo-1', { usuario: USUARIOS.OWNER, body: { nombre: 'Ana', restauranteId: 'otro' } })

      // Assert
      expect(mozos.update).toHaveBeenCalledWith('mozo-1', { nombre: 'Ana' }, USUARIOS.OWNER)
    })

    it('un GERENTE no puede modificar mozos (403)', async () => {
      // Act
      const res = await api.pedir('patch', '/mozos/mozo-1', { usuario: USUARIOS.GERENTE, body: { nombre: 'Ana' } })

      // Assert
      expect(res.status).toBe(403)
    })

    it('DELETE /mozos/:id responde 204 sin cuerpo', async () => {
      // Arrange
      mozos.remove.mockResolvedValue(undefined)

      // Act
      const res = await api.pedir('delete', '/mozos/mozo-1', { usuario: USUARIOS.OWNER })

      // Assert
      expect(res.status).toBe(204)
      expect(res.text).toBe('')
      expect(mozos.remove).toHaveBeenCalledWith('mozo-1', USUARIOS.OWNER)
    })
  })

  describe('asignación de mesas', () => {
    it('POST /mozos/:mozoId/mesas responde 201 con la asignación', async () => {
      // Arrange
      mozos.assignMesa.mockResolvedValue({ mozoId: 'mozo-1', mesaId: 'mesa-1' })

      // Act
      const res = await api.pedir('post', '/mozos/mozo-1/mesas', { usuario: USUARIOS.GERENTE, body: { mesaId: 'mesa-1' } })

      // Assert
      expect(res.status).toBe(201)
      expect(mozos.assignMesa).toHaveBeenCalledWith('mozo-1', 'mesa-1', USUARIOS.GERENTE)
    })

    it('DELETE /mozos/:mozoId/mesas/:mesaId responde 204', async () => {
      // Arrange
      mozos.unassignMesa.mockResolvedValue(undefined)

      // Act
      const res = await api.pedir('delete', '/mozos/mozo-1/mesas/mesa-1', { usuario: USUARIOS.OWNER })

      // Assert
      expect(res.status).toBe(204)
      expect(mozos.unassignMesa).toHaveBeenCalledWith('mozo-1', 'mesa-1', USUARIOS.OWNER)
    })
  })
})
