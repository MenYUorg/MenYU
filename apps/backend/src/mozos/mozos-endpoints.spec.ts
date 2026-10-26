import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { MozosController } from './mozos.controller'
import { MozosService } from './mozos.service'

const REST_ID = MUNDO.REST_1
const MESA_ID = '6f1c2a40-4444-4a1b-9c3d-000000000001'

// GET /mozos exige OWNER o GERENTE del restaurante de la query; en las rutas de un mozo, el service pide el rol.
describe('endpoints de mozos', () => {
  let api: AppDeEndpoints
  const mozos = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
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

  it('POST /mozos ya no existe: los mozos se suman invitándolos (404)', async () => {
    // Act
    const res = await api.pedir('post', '/mozos', {
      cuenta: CUENTAS.OWNER_A,
      body: { restauranteId: REST_ID, nombre: 'Juan', password: 'secreta123' },
    })

    // Assert
    expect(res.status).toBe(404)
  })

  describe('GET /mozos (el restaurante de la query)', () => {
    it.each([
      ['el GERENTE', CUENTAS.GERENTE],
      ['el OWNER de la marca', CUENTAS.OWNER_A],
    ])('%s lista los mozos', async (_caso, cuenta) => {
      // Arrange
      mozos.findAll.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/mozos', { cuenta, query: { restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(200)
      expect(mozos.findAll).toHaveBeenCalledWith(REST_ID)
    })

    it.each([
      ['ROOT', CUENTAS.ROOT],
      ['el MOZO', CUENTAS.MOZO],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
    ])('%s recibe 403', async (_caso, cuenta) => {
      // Act
      const res = await api.pedir('get', '/mozos', { cuenta, query: { restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(403)
      expect(mozos.findAll).not.toHaveBeenCalled()
    })
  })

  describe('las rutas de un mozo le pasan la cuenta al service', () => {
    it('GET /mozos/:id, /mesas y /llamados-hoy', async () => {
      // Arrange
      mozos.findOne.mockResolvedValue({ id: 'mozo-1' })
      mozos.getMesas.mockResolvedValue([{ id: 'mesa-1' }])
      mozos.llamadosHoy.mockResolvedValue({ total: 3 })

      // Act
      const mozo = await api.pedir('get', '/mozos/mozo-1', { cuenta: CUENTAS.OWNER_A })
      const mesas = await api.pedir('get', '/mozos/mozo-1/mesas', { cuenta: CUENTAS.OWNER_A })
      const llamados = await api.pedir('get', '/mozos/mozo-1/llamados-hoy', { cuenta: CUENTAS.OWNER_A })

      // Assert
      expect(mozo.body).toEqual({ id: 'mozo-1' })
      expect(mesas.body).toEqual([{ id: 'mesa-1' }])
      expect(llamados.body).toEqual({ total: 3 })
      expect(mozos.findOne).toHaveBeenCalledWith('mozo-1', CUENTAS.OWNER_A)
      expect(mozos.getMesas).toHaveBeenCalledWith('mozo-1', CUENTAS.OWNER_A)
      expect(mozos.llamadosHoy).toHaveBeenCalledWith('mozo-1', CUENTAS.OWNER_A)
    })

    it('PATCH /mozos/:id acepta solo nombre y teléfono: descarta el email, la contraseña, activo y esJefeSalon', async () => {
      // Arrange
      mozos.update.mockResolvedValue({ id: 'mozo-1' })

      // Act
      const res = await api.pedir('patch', '/mozos/mozo-1', {
        cuenta: CUENTAS.OWNER_A,
        body: { nombre: 'Ana', telefono: '123', email: 'otro@x.com', password: 'nueva1234', activo: false, esJefeSalon: true },
      })

      // Assert
      expect(res.status).toBe(200)
      expect(mozos.update).toHaveBeenCalledWith('mozo-1', { nombre: 'Ana', telefono: '123' }, CUENTAS.OWNER_A)
    })

    it('PATCH /mozos/:id con un nombre vacío: 400', async () => {
      // Act
      const res = await api.pedir('patch', '/mozos/mozo-1', { cuenta: CUENTAS.OWNER_A, body: { nombre: '' } })

      // Assert
      expect(res.status).toBe(400)
      expect(mozos.update).not.toHaveBeenCalled()
    })

    it('sin token 401 y sin Usuario 403', async () => {
      // Act
      const anonimo = await api.pedir('get', '/mozos/mozo-1')
      const sinUsuario = await api.pedir('get', '/mozos/mozo-1', { cuenta: SIN_USUARIO })

      // Assert
      expect(anonimo.status).toBe(401)
      expect(sinUsuario.status).toBe(403)
      expect(mozos.findOne).not.toHaveBeenCalled()
    })
  })

  describe('asignación de mesas', () => {
    it('POST /mozos/:mozoId/mesas responde 201 con la asignación', async () => {
      // Arrange
      mozos.assignMesa.mockResolvedValue({ mozoId: 'mozo-1', mesaId: MESA_ID })

      // Act
      const res = await api.pedir('post', '/mozos/mozo-1/mesas', { cuenta: CUENTAS.GERENTE, body: { mesaId: MESA_ID } })

      // Assert
      expect(res.status).toBe(201)
      expect(mozos.assignMesa).toHaveBeenCalledWith('mozo-1', MESA_ID, CUENTAS.GERENTE)
    })

    it.each([
      ['sin mesaId', {}],
      ['con un mesaId que no es UUID', { mesaId: 'mesa-1' }],
    ])('POST /mozos/:mozoId/mesas %s: 400', async (_caso, body) => {
      // Act
      const res = await api.pedir('post', '/mozos/mozo-1/mesas', { cuenta: CUENTAS.GERENTE, body })

      // Assert
      expect(res.status).toBe(400)
      expect(mozos.assignMesa).not.toHaveBeenCalled()
    })

    it('DELETE /mozos/:mozoId/mesas/:mesaId responde 204', async () => {
      // Arrange
      mozos.unassignMesa.mockResolvedValue(undefined)

      // Act
      const res = await api.pedir('delete', '/mozos/mozo-1/mesas/mesa-1', { cuenta: CUENTAS.OWNER_A })

      // Assert
      expect(res.status).toBe(204)
      expect(mozos.unassignMesa).toHaveBeenCalledWith('mozo-1', 'mesa-1', CUENTAS.OWNER_A)
    })
  })
})
