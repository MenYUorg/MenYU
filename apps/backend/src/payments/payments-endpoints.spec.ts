import { AppDeEndpoints, SESION_CLIENTE, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'

describe('endpoints de pagos', () => {
  let api: AppDeEndpoints
  const payments = {
    solicitarEfectivo: jest.fn(),
    avisarMozoPedidoDeCuenta: jest.fn(),
    getSesiones: jest.fn(),
    confirmarEfectivo: jest.fn(),
    crearPreferenciaMercadoPago: jest.fn(),
    procesarWebhookMercadoPago: jest.fn(),
  }
  const DE_LA_SESION = { sesionId: SESION_CLIENTE.sesionId }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(PaymentsController, [{ provide: PaymentsService, useValue: payments }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  describe('comensal (sesión de mesa)', () => {
    it('POST /payments/solicitar-efectivo delega con la sesión (201)', async () => {
      // Arrange
      payments.solicitarEfectivo.mockResolvedValue({ ok: true })

      // Act
      const res = await api.pedir('post', '/payments/solicitar-efectivo', { sesion: SESION_CLIENTE, body: DE_LA_SESION })

      // Assert
      expect(res.status).toBe(201)
      expect(payments.solicitarEfectivo).toHaveBeenCalledWith(SESION_CLIENTE.sesionId)
    })

    it('POST /payments/avisar-mozo-cuenta delega con la sesión (201)', async () => {
      // Arrange
      payments.avisarMozoPedidoDeCuenta.mockResolvedValue({ ok: true })

      // Act
      const res = await api.pedir('post', '/payments/avisar-mozo-cuenta', { sesion: SESION_CLIENTE, body: DE_LA_SESION })

      // Assert
      expect(res.status).toBe(201)
      expect(payments.avisarMozoPedidoDeCuenta).toHaveBeenCalledWith(SESION_CLIENTE.sesionId)
    })

    it('POST /payments/mercadopago/crear-preferencia pasa el Origin del navegador', async () => {
      // Arrange
      payments.crearPreferenciaMercadoPago.mockResolvedValue({ initPoint: 'https://mp.test/checkout' })

      // Act
      const res = await api
        .pedir('post', '/payments/mercadopago/crear-preferencia', { sesion: SESION_CLIENTE, body: DE_LA_SESION })
        .set('Origin', 'https://menyu-cliente.vercel.app')

      // Assert
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ initPoint: 'https://mp.test/checkout' })
      expect(payments.crearPreferenciaMercadoPago).toHaveBeenCalledWith(SESION_CLIENTE.sesionId, 'https://menyu-cliente.vercel.app')
    })

    it('sin JWT de sesión responde 401', async () => {
      // Act
      const res = await api.pedir('post', '/payments/solicitar-efectivo', { body: DE_LA_SESION })

      // Assert
      expect(res.status).toBe(401)
      expect(payments.solicitarEfectivo).not.toHaveBeenCalled()
    })
  })

  describe('staff (admin o mozo)', () => {
    it('GET /payments/sesiones: un mozo lista las sesiones del restaurante', async () => {
      // Arrange
      payments.getSesiones.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/payments/sesiones', { usuario: USUARIOS.MOZO, query: { restauranteId: 'rest-1' } })

      // Assert
      expect(res.status).toBe(200)
      expect(payments.getSesiones).toHaveBeenCalledWith('rest-1')
    })

    it('POST /payments/confirmar-efectivo pasa el pago y el mozo (200)', async () => {
      // Arrange
      payments.confirmarEfectivo.mockResolvedValue({ ok: true })

      // Act
      const res = await api.pedir('post', '/payments/confirmar-efectivo', { usuario: USUARIOS.MOZO, body: { pagoId: 'pago-1', mozoId: 'mozo-1' } })

      // Assert
      expect(res.status).toBe(200)
      expect(payments.confirmarEfectivo).toHaveBeenCalledWith('pago-1', 'mozo-1')
    })

    it('un usuario de cocina no puede confirmar pagos (403)', async () => {
      // Act
      const res = await api.pedir('post', '/payments/confirmar-efectivo', { usuario: USUARIOS.COCINA, body: { pagoId: 'pago-1' } })

      // Assert
      expect(res.status).toBe(403)
      expect(payments.confirmarEfectivo).not.toHaveBeenCalled()
    })
  })

  describe('webhook de Mercado Pago (sin guard: lo llama Mercado Pago)', () => {
    const RUTA = '/payments/webhook/mercadopago/restaurante/rest-1/pago/pago-1'

    it('responde 200 "OK" y procesa la notificación con los ids de la ruta y la query', async () => {
      // Arrange
      payments.procesarWebhookMercadoPago.mockResolvedValue(undefined)

      // Act
      const res = await api.pedir('post', RUTA, { query: { type: 'payment', 'data.id': '999' } })

      // Assert
      expect(res.status).toBe(200)
      expect(res.text).toBe('OK')
      expect(payments.procesarWebhookMercadoPago).toHaveBeenCalledWith('rest-1', 'pago-1', { type: 'payment', 'data.id': '999' })
    })

    it('si el procesamiento falla igual responde 200 (MP no reintenta por un error nuestro) y lo registra', async () => {
      // Arrange
      payments.procesarWebhookMercadoPago.mockRejectedValue(new Error('MP caído'))
      const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)

      // Act
      const res = await api.pedir('post', RUTA, { query: { type: 'payment' } })

      // Assert
      expect(res.status).toBe(200)
      expect(consola).toHaveBeenCalledWith('Error procesando webhook MP:', expect.any(Error))
      consola.mockRestore()
    })
  })
})
