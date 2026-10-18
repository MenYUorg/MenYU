import { BadRequestException } from '@nestjs/common'
import { CryptoService } from '../common/crypto.service'
import { PrismaService } from '../prisma/prisma.service'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

// Conexión de la cuenta de Mercado Pago de un restaurante (OAuth). fetch y Prisma son dobles; el cifrado también,
// para ver qué se guarda (CryptoService se prueba aparte).
describe('MercadoPagoOAuthService', () => {
  const entorno = process.env
  const fetchOriginal = global.fetch
  const prisma = { restaurante: { update: jest.fn(), findUnique: jest.fn() } }
  const crypto = {
    encrypt: jest.fn((texto: string) => `cifrado(${texto})`),
    decrypt: jest.fn((texto: string) => texto.replace(/^cifrado\((.*)\)$/, '$1')),
  }
  const fetchMock = jest.fn()
  let service: MercadoPagoOAuthService

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...entorno, MP_CLIENT_ID: 'cliente-123', MP_CLIENT_SECRET: 'secreto', BASE_URL: 'https://api.menyu.test' }
    global.fetch = fetchMock as unknown as typeof fetch
    service = new MercadoPagoOAuthService(prisma as unknown as PrismaService, crypto as unknown as CryptoService)
  })

  afterEach(() => {
    process.env = entorno
    global.fetch = fetchOriginal
  })

  describe('buildAuthUrl', () => {
    it('arma la URL de autorización de Mercado Pago con el cliente, el callback y el restaurante', () => {
      // Act
      const url = new URL(service.buildAuthUrl('rest-1'))

      // Assert
      expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com/authorization')
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: 'cliente-123',
        response_type: 'code',
        platform_id: 'mp',
        redirect_uri: 'https://api.menyu.test/payments/mercadopago/oauth/callback',
        state: 'rest-1',
      })
    })
  })

  describe('handleCallback', () => {
    const RESPUESTA_MP = { access_token: 'APP_USR-acceso', refresh_token: 'TG-refresco', user_id: 98765, expires_in: 3600 }

    it('cambia el código por los tokens y los guarda cifrados en el restaurante, con el vencimiento', async () => {
      // Arrange
      const ahora = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-18T12:00:00Z'))
      fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(RESPUESTA_MP) })
      prisma.restaurante.update.mockResolvedValue({})

      // Act
      const resultado = await service.handleCallback('codigo-oauth', 'rest-1')

      // Assert
      expect(resultado).toEqual({ conectado: true })
      const [url, opciones] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.mercadopago.com/oauth/token')
      expect(opciones.method).toBe('POST')
      expect(JSON.parse(opciones.body as string)).toEqual({
        client_id: 'cliente-123',
        client_secret: 'secreto',
        grant_type: 'authorization_code',
        code: 'codigo-oauth',
        redirect_uri: 'https://api.menyu.test/payments/mercadopago/oauth/callback',
      })
      expect(prisma.restaurante.update).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        data: {
          mpAccessToken: 'cifrado(APP_USR-acceso)',
          mpRefreshToken: 'cifrado(TG-refresco)',
          mpUserId: '98765',
          mpTokenExpiresAt: new Date('2026-10-18T13:00:00Z'),
        },
      })
      ahora.mockRestore()
    })

    it('si Mercado Pago rechaza el código responde 400 y no guarda nada', async () => {
      // Arrange
      fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'invalid_grant' }) })

      // Act + Assert
      await expect(service.handleCallback('codigo-vencido', 'rest-1')).rejects.toThrow(
        new BadRequestException('No se pudo intercambiar el código de OAuth con Mercado Pago'),
      )
      expect(prisma.restaurante.update).not.toHaveBeenCalled()
    })
  })

  describe('getAccessTokenDecrypted', () => {
    it('devuelve el access token del restaurante descifrado', async () => {
      // Arrange
      prisma.restaurante.findUnique.mockResolvedValue({ mpAccessToken: 'cifrado(APP_USR-acceso)' })

      // Act
      const token = await service.getAccessTokenDecrypted('rest-1')

      // Assert
      expect(token).toBe('APP_USR-acceso')
      expect(prisma.restaurante.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rest-1' } }))
    })

    it.each([
      ['no tiene token', { mpAccessToken: null }],
      ['no existe', null],
    ])('si el restaurante %s responde 400', async (_, restaurante) => {
      // Arrange
      prisma.restaurante.findUnique.mockResolvedValue(restaurante)

      // Act + Assert
      await expect(service.getAccessTokenDecrypted('rest-1')).rejects.toThrow(
        new BadRequestException('Este restaurante no tiene Mercado Pago conectado'),
      )
      expect(crypto.decrypt).not.toHaveBeenCalled()
    })
  })
})
