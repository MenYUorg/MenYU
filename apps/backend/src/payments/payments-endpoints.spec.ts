import { AppDeEndpoints, CUENTAS, MUNDO, SESION_CLIENTE, SIN_USUARIO, USUARIOS, crearAppDeEndpoints } from '../test/app-endpoints'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'

describe('endpoints de pagos', () => {
  let api: AppDeEndpoints
  const payments = {
    solicitarEfectivo: jest.fn(),
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

    it.each(['/payments/solicitar-efectivo', '/payments/mercadopago/crear-preferencia'])(
      'POST %s con la sesión de otra mesa en el body responde 403',
      async (ruta) => {
        // Act
        const res = await api.pedir('post', ruta, { sesion: SESION_CLIENTE, body: { sesionId: 'sesion-de-otra-mesa' } })

        // Assert
        expect(res.status).toBe(403)
        expect(payments.solicitarEfectivo).not.toHaveBeenCalled()
        expect(payments.crearPreferenciaMercadoPago).not.toHaveBeenCalled()
      },
    )

    it('un token de invitado (tipo cliente, sin sesión de mesa) responde 401', async () => {
      // Act
      const res = await api.pedir('post', '/payments/solicitar-efectivo', { sesion: USUARIOS.CLIENTE, body: DE_LA_SESION })

      // Assert
      expect(res.status).toBe(401)
      expect(payments.solicitarEfectivo).not.toHaveBeenCalled()
    })
  })

  describe('el salón (OWNER, GERENTE, JEFE_SALON y MOZO)', () => {
    const PAGO_ID = '6f1c2a40-5555-4a1b-9c3d-000000000001'

    it('GET /payments/sesiones: el MOZO lista las sesiones del restaurante', async () => {
      // Arrange
      payments.getSesiones.mockResolvedValue([])

      // Act
      const res = await api.pedir('get', '/payments/sesiones', { cuenta: CUENTAS.MOZO, query: { restauranteId: MUNDO.REST_1 } })

      // Assert
      expect(res.status).toBe(200)
      expect(payments.getSesiones).toHaveBeenCalledWith(MUNDO.REST_1)
    })

    it.each([
      ['la COCINA', CUENTAS.COCINA, MUNDO.REST_1],
      ['ROOT', CUENTAS.ROOT, MUNDO.REST_1],
      ['el MOZO de otro restaurante (antes no se chequeaba la pertenencia)', CUENTAS.MOZO, MUNDO.REST_2],
    ])('GET /payments/sesiones: %s recibe 403', async (_caso, cuenta, restauranteId) => {
      // Act
      const res = await api.pedir('get', '/payments/sesiones', { cuenta, query: { restauranteId } })

      // Assert
      expect(res.status).toBe(403)
      expect(payments.getSesiones).not.toHaveBeenCalled()
    })

    it('POST /payments/confirmar-efectivo pasa el body validado y la cuenta (200)', async () => {
      // Arrange
      payments.confirmarEfectivo.mockResolvedValue({ ok: true })

      // Act
      const res = await api.pedir('post', '/payments/confirmar-efectivo', {
        cuenta: CUENTAS.GERENTE,
        body: { pagoId: PAGO_ID, mozoId: 'mozo-1', otroCampo: 'x' },
      })

      // Assert
      expect(res.status).toBe(200)
      expect(payments.confirmarEfectivo).toHaveBeenCalledWith({ pagoId: PAGO_ID, mozoId: 'mozo-1' }, CUENTAS.GERENTE)
    })

    it('POST /payments/confirmar-efectivo sin un pagoId UUID: 400', async () => {
      // Act
      const res = await api.pedir('post', '/payments/confirmar-efectivo', { cuenta: CUENTAS.MOZO, body: { pagoId: 'pago-1' } })

      // Assert
      expect(res.status).toBe(400)
      expect(payments.confirmarEfectivo).not.toHaveBeenCalled()
    })

    it('con el token de la sesión de mesa o sin token no se confirman pagos (401), y sin Usuario 403', async () => {
      // Act
      const comensal = await api.pedir('post', '/payments/confirmar-efectivo', { sesion: SESION_CLIENTE, body: { pagoId: PAGO_ID } })
      const sinUsuario = await api.pedir('post', '/payments/confirmar-efectivo', { cuenta: SIN_USUARIO, body: { pagoId: PAGO_ID } })

      // Assert
      expect([comensal.status, sinUsuario.status]).toEqual([401, 403])
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
