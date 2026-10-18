import { MercadoPagoProvider } from './mercado-pago.provider'

// El SDK de Mercado Pago es el borde externo (HTTP): se mockea el módulo entero.
const sdk = {
  preferenceCreate: jest.fn(),
  paymentGet: jest.fn(),
  merchantOrderGet: jest.fn(),
  config: jest.fn(),
}
jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn((opciones) => sdk.config(opciones)),
  Preference: jest.fn(() => ({ create: sdk.preferenceCreate })),
  Payment: jest.fn(() => ({ get: sdk.paymentGet })),
  MerchantOrder: jest.fn(() => ({ get: sdk.merchantOrderGet })),
}))

const PAGO = {
  accessToken: 'token-del-restaurante',
  sesionId: 'sesion-1',
  restauranteId: 'rest-1',
  pagoId: 'pago-1',
  descripcion: 'Mesa 5',
  monto: 4200,
  externalReference: 'sesion-1:pago-1',
}

describe('MercadoPagoProvider', () => {
  const provider = new MercadoPagoProvider()
  const entorno = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...entorno, BASE_URL: 'https://api.menyu.test/api', FRONTEND_URL: 'https://menu.menyu.test' }
    sdk.preferenceCreate.mockResolvedValue({ id: 'pref-1', init_point: 'https://mp.test/checkout/pref-1' })
  })

  afterAll(() => {
    process.env = entorno
  })

  describe('createPreference', () => {
    it('arma la preferencia con el ítem, la URL del webhook del pago y devuelve id e init point', async () => {
      // Act
      const preferencia = await provider.createPreference(PAGO)

      // Assert
      expect(sdk.config).toHaveBeenCalledWith({ accessToken: 'token-del-restaurante' })
      const { body } = sdk.preferenceCreate.mock.calls[0][0]
      expect(body.items).toEqual([{ id: 'pago-1', title: 'Mesa 5', unit_price: 4200, quantity: 1, currency_id: 'ARS' }])
      expect(body.notification_url).toBe('https://api.menyu.test/api/payments/webhook/mercadopago/restaurante/rest-1/pago/pago-1')
      expect(body.external_reference).toBe('sesion-1:pago-1')
      expect(preferencia).toEqual({ id: 'pref-1', initPoint: 'https://mp.test/checkout/pref-1', externalReference: 'sesion-1:pago-1' })
    })

    it('sin URLs de vuelta usa las del frontend y, al ser HTTPS públicas, pide auto_return', async () => {
      // Act
      await provider.createPreference(PAGO)

      // Assert
      const { body } = sdk.preferenceCreate.mock.calls[0][0]
      expect(body.back_urls).toEqual({
        success: 'https://menu.menyu.test/pago/exitoso',
        failure: 'https://menu.menyu.test/pago/fallido',
        pending: 'https://menu.menyu.test/pago/pendiente',
      })
      expect(body.auto_return).toBe('approved')
    })

    it('con una URL de éxito en localhost no pide auto_return (Mercado Pago lo rechazaría)', async () => {
      // Act
      await provider.createPreference({ ...PAGO, successUrl: 'http://localhost:5173/pago/exitoso' })

      // Assert
      const { body } = sdk.preferenceCreate.mock.calls[0][0]
      expect(body.back_urls.success).toBe('http://localhost:5173/pago/exitoso')
      expect(body).not.toHaveProperty('auto_return')
    })
  })

  describe('processWebhook', () => {
    const orden = (payments: object[], extra: object = {}) => ({
      id: 777,
      total_amount: 1000,
      external_reference: 'sesion-1:pago-1',
      payments,
      ...extra,
    })

    it.each([
      ['los pagos aprobados cubren el total', [{ status: 'approved', transaction_amount: 1000 }], 'APROBADO'],
      ['hay un pago en proceso', [{ status: 'in_process', transaction_amount: 1000 }], 'EN_PROCESO'],
      ['hay un pago rechazado', [{ status: 'rejected', transaction_amount: 1000 }], 'RECHAZADO'],
      ['lo aprobado no cubre el total', [{ status: 'approved', transaction_amount: 400 }], 'PENDIENTE'],
    ])('notificación de merchant_order: si %s el estado es %s', async (_caso, pagos, estado) => {
      // Arrange
      sdk.merchantOrderGet.mockResolvedValue(orden(pagos))

      // Act
      const resultado = await provider.processWebhook({ topic: 'merchant_order', id: '777' }, 'token')

      // Assert
      expect(sdk.merchantOrderGet).toHaveBeenCalledWith({ merchantOrderId: '777' })
      expect(resultado).toEqual({ externalId: '777', status: estado, externalReference: 'sesion-1:pago-1' })
    })

    it('notificación de payment: busca la orden del pago y suma sus pagos', async () => {
      // Arrange
      sdk.paymentGet.mockResolvedValue({ id: '555', order: { id: '777' } })
      sdk.merchantOrderGet.mockResolvedValue(orden([{ status: 'approved', transaction_amount: 1000 }]))

      // Act
      const resultado = await provider.processWebhook({ type: 'payment', 'data.id': '555' }, 'token')

      // Assert
      expect(sdk.paymentGet).toHaveBeenCalledWith({ id: '555' })
      expect(sdk.merchantOrderGet).toHaveBeenCalledWith({ merchantOrderId: '777' })
      expect(resultado.status).toBe('APROBADO')
    })

    it('un payment todavía sin orden queda PENDIENTE', async () => {
      // Arrange
      sdk.paymentGet.mockResolvedValue({ id: '555' })

      // Act
      const resultado = await provider.processWebhook({ type: 'payment', 'data.id': '555' }, 'token')

      // Assert
      expect(resultado).toEqual({ externalId: '555', status: 'PENDIENTE', externalReference: '' })
      expect(sdk.merchantOrderGet).not.toHaveBeenCalled()
    })

    it('un tópico desconocido queda PENDIENTE sin consultar a Mercado Pago', async () => {
      // Act
      const resultado = await provider.processWebhook({ topic: 'chargebacks' }, 'token')

      // Assert
      expect(resultado).toEqual({ externalId: 'desconocido', status: 'PENDIENTE', externalReference: '' })
      expect(sdk.paymentGet).not.toHaveBeenCalled()
      expect(sdk.merchantOrderGet).not.toHaveBeenCalled()
    })

    it('una orden sin pagos ni external_reference queda PENDIENTE con referencia vacía', async () => {
      // Arrange
      sdk.merchantOrderGet.mockResolvedValue({ id: 778, total_amount: 1000 })

      // Act
      const resultado = await provider.processWebhook({ topic: 'merchant_order', id: '778' }, 'token')

      // Assert
      expect(resultado).toEqual({ externalId: '778', status: 'PENDIENTE', externalReference: '' })
    })
  })

  describe('getPaymentStatus', () => {
    it.each([
      ['approved', 'APROBADO'],
      ['rejected', 'RECHAZADO'],
      ['in_process', 'EN_PROCESO'],
      ['pending', 'PENDIENTE'],
      ['refunded', 'PENDIENTE'],
    ])('el estado "%s" de Mercado Pago se traduce a %s', async (estadoMp, estado) => {
      // Arrange
      sdk.paymentGet.mockResolvedValue({ status: estadoMp })

      // Act
      const resultado = await provider.getPaymentStatus('555', 'token')

      // Assert
      expect(resultado).toBe(estado)
    })
  })
})
