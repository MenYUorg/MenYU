import { BadRequestException } from '@nestjs/common'
import { AppDeEndpoints, crearAppDeEndpoints } from '../test/app-endpoints'
import { MercadoPagoOAuthController } from './mercado-pago-oauth.controller'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

describe('endpoints de OAuth de Mercado Pago', () => {
  const entorno = process.env
  let api: AppDeEndpoints
  const oauth = { handleCallback: jest.fn() }

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

  it('si el intercambio del código falla, el callback responde el error y no redirige', async () => {
    // Arrange
    oauth.handleCallback.mockRejectedValue(new BadRequestException('No se pudo intercambiar el código de OAuth con Mercado Pago'))

    // Act
    const res = await api.pedir('get', '/payments/mercadopago/oauth/callback', { query: { code: 'x', state: 'state-de-mercado-pago' } })

    // Assert
    expect(res.status).toBe(400)
    expect(res.headers['location']).toBeUndefined()
  })
})
