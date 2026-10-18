import { BadRequestException } from '@nestjs/common'
import { AppDeEndpoints, crearAppDeEndpoints } from '../test/app-endpoints'
import { MercadoPagoOAuthController } from './mercado-pago-oauth.controller'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

describe('endpoints de OAuth de Mercado Pago', () => {
  const entorno = process.env
  let api: AppDeEndpoints
  const oauth = { buildAuthUrl: jest.fn(), handleCallback: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(MercadoPagoOAuthController, [{ provide: MercadoPagoOAuthService, useValue: oauth }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...entorno, FRONTEND_ADMIN_URL: 'https://admin.menyu.test' }
  })

  afterEach(() => {
    process.env = entorno
  })

  it('GET /payments/mercadopago/oauth/conectar redirige a la autorización de Mercado Pago del restaurante', async () => {
    // Arrange
    oauth.buildAuthUrl.mockReturnValue('https://auth.mercadopago.com/authorization?state=rest-1')

    // Act
    const res = await api.pedir('get', '/payments/mercadopago/oauth/conectar', { query: { restauranteId: 'rest-1' } })

    // Assert
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('https://auth.mercadopago.com/authorization?state=rest-1')
    expect(oauth.buildAuthUrl).toHaveBeenCalledWith('rest-1')
  })

  it('GET /payments/mercadopago/oauth/callback guarda la conexión y vuelve a la configuración de pagos del admin', async () => {
    // Arrange
    oauth.handleCallback.mockResolvedValue({ conectado: true })

    // Act
    const res = await api.pedir('get', '/payments/mercadopago/oauth/callback', { query: { code: 'codigo-oauth', state: 'rest-1' } })

    // Assert
    expect(res.status).toBe(302)
    expect(res.headers['location']).toBe('https://admin.menyu.test/configuracion/pagos?mp=conectado')
    expect(oauth.handleCallback).toHaveBeenCalledWith('codigo-oauth', 'rest-1')
  })

  it('si el intercambio del código falla, el callback responde el error y no redirige', async () => {
    // Arrange
    oauth.handleCallback.mockRejectedValue(new BadRequestException('No se pudo intercambiar el código de OAuth con Mercado Pago'))

    // Act
    const res = await api.pedir('get', '/payments/mercadopago/oauth/callback', { query: { code: 'x', state: 'rest-1' } })

    // Assert
    expect(res.status).toBe(400)
    expect(res.headers['location']).toBeUndefined()
  })
})
