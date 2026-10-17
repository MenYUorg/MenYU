import { AppDeEndpoints, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { MesasController } from './mesas.controller'
import { MesasService } from './mesas.service'

const REST_ID = '6f1c2a40-1111-4a1b-9c3d-000000000001'

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

  describe('POST /mesas', () => {
    it('un GERENTE crea una mesa (201)', async () => {
      // Arrange
      mesas.create.mockResolvedValue({ id: 'mesa-1', qrImage: 'data:image/png;base64,x' })

      // Act
      const res = await api.pedir('post', '/mesas', { usuario: USUARIOS.GERENTE, body: { numero: '5', restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(201)
      expect(mesas.create).toHaveBeenCalledWith({ numero: '5', restauranteId: REST_ID })
    })

    it('con un estado que no existe responde 400', async () => {
      // Act
      const res = await api.pedir('post', '/mesas', {
        usuario: USUARIOS.OWNER,
        body: { numero: '5', restauranteId: REST_ID, estado: 'rota' },
      })

      // Assert
      expect(res.status).toBe(400)
      expect(mesas.create).not.toHaveBeenCalled()
    })

    it('un mozo no puede crear mesas (403)', async () => {
      // Act
      const res = await api.pedir('post', '/mesas', { usuario: USUARIOS.MOZO, body: { numero: '5', restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(403)
    })
  })

  describe('GET /mesas (admins y mozos)', () => {
    it('un mozo puede listar las mesas', async () => {
      // Arrange
      mesas.findAll.mockResolvedValue([{ id: 'mesa-1' }])

      // Act
      const res = await api.pedir('get', '/mesas', { usuario: USUARIOS.MOZO, query: { restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(200)
      expect(mesas.findAll).toHaveBeenCalledWith(REST_ID, USUARIOS.MOZO)
    })

    it('un usuario de cocina no puede (403)', async () => {
      // Act
      const res = await api.pedir('get', '/mesas', { usuario: USUARIOS.COCINA, query: { restauranteId: REST_ID } })

      // Assert
      expect(res.status).toBe(403)
      expect(mesas.findAll).not.toHaveBeenCalled()
    })
  })

  describe('una mesa', () => {
    it('GET y PATCH /mesas/:id delegan con el id', async () => {
      // Arrange
      mesas.findOne.mockResolvedValue({ id: 'mesa-1' })
      mesas.update.mockResolvedValue({ id: 'mesa-1', numero: '6' })

      // Act
      const lectura = await api.pedir('get', '/mesas/mesa-1', { usuario: USUARIOS.GERENTE })
      const cambio = await api.pedir('patch', '/mesas/mesa-1', { usuario: USUARIOS.GERENTE, body: { numero: '6' } })

      // Assert
      expect(lectura.body).toEqual({ id: 'mesa-1' })
      expect(cambio.status).toBe(200)
      expect(mesas.update).toHaveBeenCalledWith('mesa-1', { numero: '6' }, USUARIOS.GERENTE)
    })

    it('DELETE /mesas/:id: el OWNER la borra (204), un GERENTE no (403)', async () => {
      // Arrange
      mesas.remove.mockResolvedValue(undefined)

      // Act
      const owner = await api.pedir('delete', '/mesas/mesa-1', { usuario: USUARIOS.OWNER })
      const gerente = await api.pedir('delete', '/mesas/mesa-1', { usuario: USUARIOS.GERENTE })

      // Assert
      expect(owner.status).toBe(204)
      expect(gerente.status).toBe(403)
      expect(mesas.remove).toHaveBeenCalledTimes(1)
    })

    it('POST /mesas/:id/regenerar-qr responde 200 con el QR nuevo', async () => {
      // Arrange
      mesas.regenerarQr.mockResolvedValue({ qrToken: 'nuevo', qrImage: 'data:x' })

      // Act
      const res = await api.pedir('post', '/mesas/mesa-1/regenerar-qr', { usuario: USUARIOS.OWNER })

      // Assert
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ qrToken: 'nuevo', qrImage: 'data:x' })
    })
  })

  describe('PATCH /mesas/:id/pin', () => {
    it('cambia el PIN con 4 dígitos', async () => {
      // Arrange
      mesas.cambiarPin.mockResolvedValue({ id: 'mesa-1', pin: '0420' })

      // Act
      const res = await api.pedir('patch', '/mesas/mesa-1/pin', { usuario: USUARIOS.OWNER, body: { pin: '0420' } })

      // Assert
      expect(res.status).toBe(200)
      expect(mesas.cambiarPin).toHaveBeenCalledWith('mesa-1', '0420', USUARIOS.OWNER)
    })

    it.each(['123', '12345', 'abcd'])('con el PIN "%s" responde 400 con el mensaje de validación', async (pin) => {
      // Act
      const res = await api.pedir('patch', '/mesas/mesa-1/pin', { usuario: USUARIOS.OWNER, body: { pin } })

      // Assert
      expect(res.status).toBe(400)
      expect(res.body.message).toContain('El PIN debe tener exactamente 4 dígitos numéricos')
      expect(mesas.cambiarPin).not.toHaveBeenCalled()
    })
  })
})
