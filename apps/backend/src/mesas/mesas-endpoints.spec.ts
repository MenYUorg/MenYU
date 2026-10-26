import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { MesasController } from './mesas.controller'
import { MesasService } from './mesas.service'

const REST_ID = MUNDO.REST_1

describe('endpoints de mesas', () => {
  let api: AppDeEndpoints
  const mesas = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    regenerarQr: jest.fn(),
    cambiarPin: jest.fn(),
  }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(MesasController, [{ provide: MesasService, useValue: mesas }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  describe('POST /mesas (el restaurante del body)', () => {
    it('un GERENTE crea una mesa (201)', async () => {
      // Arrange
      mesas.create.mockResolvedValue({ id: 'mesa-1', qrImage: 'data:image/png;base64,x' })

      // Act
      const res = await api.pedir('post', '/mesas', { cuenta: CUENTAS.GERENTE, body: { numero: '5', restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(201)
      expect(mesas.create).toHaveBeenCalledWith({ numero: '5', restauranteId: REST_ID })
    })

    it('con un estado que no existe responde 400', async () => {
      // Act
      const res = await api.pedir('post', '/mesas', {
        cuenta: CUENTAS.OWNER_A,
        body: { numero: '5', restauranteId: REST_ID, estado: 'rota' },
      })

      // Assert
      expect(res.status).toBe(400)
      expect(mesas.create).not.toHaveBeenCalled()
    })

    it.each([
      ['un mozo', CUENTAS.MOZO, REST_ID],
      ['ROOT', CUENTAS.ROOT, REST_ID],
      ['el OWNER de otra marca (antes no se chequeaba la pertenencia)', CUENTAS.OWNER_B, REST_ID],
      ['el GERENTE en otro restaurante', CUENTAS.GERENTE, MUNDO.REST_2],
    ])('%s no puede crear mesas (403)', async (_caso, cuenta, restauranteId) => {
      // Act
      const res = await api.pedir('post', '/mesas', { cuenta, body: { numero: '5', restauranteId } })

      // Assert
      expect(res.status).toBe(403)
      expect(mesas.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /mesas (también el salón)', () => {
    it.each([
      ['el MOZO', CUENTAS.MOZO],
      ['el JEFE_SALON', CUENTAS.JEFE_SALON],
      ['el GERENTE', CUENTAS.GERENTE],
      ['el OWNER de la marca', CUENTAS.OWNER_A],
    ])('%s lista las mesas', async (_caso, cuenta) => {
      // Arrange
      mesas.findAll.mockResolvedValue([{ id: 'mesa-1' }])

      // Act
      const res = await api.pedir('get', '/mesas', { cuenta, query: { restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(200)
      expect(mesas.findAll).toHaveBeenCalledWith(REST_ID)
    })

    it.each([
      ['la COCINA', CUENTAS.COCINA],
      ['ROOT', CUENTAS.ROOT],
      ['un Usuario sin membresías', CUENTAS.SIN_MEMBRESIAS],
    ])('%s no puede (403)', async (_caso, cuenta) => {
      // Act
      const res = await api.pedir('get', '/mesas', { cuenta, query: { restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(403)
      expect(mesas.findAll).not.toHaveBeenCalled()
    })
  })

  describe('una mesa (el rol lo pide el service)', () => {
    it('GET y PATCH /mesas/:id delegan con el id y la cuenta', async () => {
      // Arrange
      mesas.findOne.mockResolvedValue({ id: 'mesa-1' })
      mesas.update.mockResolvedValue({ id: 'mesa-1', numero: '6' })

      // Act
      const lectura = await api.pedir('get', '/mesas/mesa-1', { cuenta: CUENTAS.GERENTE })
      const cambio = await api.pedir('patch', '/mesas/mesa-1', { cuenta: CUENTAS.GERENTE, body: { numero: '6' } })

      // Assert
      expect(lectura.body).toEqual({ id: 'mesa-1' })
      expect(mesas.findOne).toHaveBeenCalledWith('mesa-1', CUENTAS.GERENTE)
      expect(cambio.status).toBe(200)
      expect(mesas.update).toHaveBeenCalledWith('mesa-1', { numero: '6' }, CUENTAS.GERENTE)
    })

    it('DELETE /mesas/:id responde 204', async () => {
      // Arrange
      mesas.remove.mockResolvedValue(undefined)

      // Act
      const res = await api.pedir('delete', '/mesas/mesa-1', { cuenta: CUENTAS.OWNER_A })

      // Assert
      expect(res.status).toBe(204)
      expect(mesas.remove).toHaveBeenCalledWith('mesa-1', CUENTAS.OWNER_A)
    })

    it('POST /mesas/:id/regenerar-qr responde 200 con el QR nuevo', async () => {
      // Arrange
      mesas.regenerarQr.mockResolvedValue({ qrToken: 'nuevo', qrImage: 'data:x' })

      // Act
      const res = await api.pedir('post', '/mesas/mesa-1/regenerar-qr', { cuenta: CUENTAS.OWNER_A })

      // Assert
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ qrToken: 'nuevo', qrImage: 'data:x' })
    })

    it('sin token 401 y sin Usuario 403', async () => {
      // Act
      const anonimo = await api.pedir('get', '/mesas/mesa-1')
      const sinUsuario = await api.pedir('delete', '/mesas/mesa-1', { cuenta: SIN_USUARIO })

      // Assert
      expect(anonimo.status).toBe(401)
      expect(sinUsuario.status).toBe(403)
      expect(mesas.findOne).not.toHaveBeenCalled()
      expect(mesas.remove).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /mesas/:id/pin', () => {
    it('cambia el PIN con 4 dígitos', async () => {
      // Arrange
      mesas.cambiarPin.mockResolvedValue({ id: 'mesa-1', pin: '0420' })

      // Act
      const res = await api.pedir('patch', '/mesas/mesa-1/pin', { cuenta: CUENTAS.OWNER_A, body: { pin: '0420' } })

      // Assert
      expect(res.status).toBe(200)
      expect(mesas.cambiarPin).toHaveBeenCalledWith('mesa-1', '0420', CUENTAS.OWNER_A)
    })

    it.each(['123', '12345', 'abcd'])('con el PIN "%s" responde 400 con el mensaje de validación', async (pin) => {
      // Act
      const res = await api.pedir('patch', '/mesas/mesa-1/pin', { cuenta: CUENTAS.OWNER_A, body: { pin } })

      // Assert
      expect(res.status).toBe(400)
      expect(res.body.message).toContain('El PIN debe tener exactamente 4 dígitos numéricos')
      expect(mesas.cambiarPin).not.toHaveBeenCalled()
    })
  })
})
