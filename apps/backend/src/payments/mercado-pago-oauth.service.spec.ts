import { BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { CryptoService } from '../common/crypto.service'
import { PrismaService } from '../prisma/prisma.service'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

// El access token de Mercado Pago de un restaurante, guardado cifrado. Prisma y el cifrado son dobles
// (CryptoService se prueba aparte).
describe('MercadoPagoOAuthService', () => {
  const prisma = { restaurante: { findUnique: jest.fn() } }
  const crypto = { decrypt: jest.fn((texto: string) => texto.replace(/^cifrado\((.*)\)$/, '$1')) }
  let service: MercadoPagoOAuthService

  beforeEach(async () => {
    jest.clearAllMocks()
    const moduleRef = await Test.createTestingModule({
      providers: [
        MercadoPagoOAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: JwtService, useValue: {} },
      ],
    }).compile()
    service = moduleRef.get(MercadoPagoOAuthService)
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
