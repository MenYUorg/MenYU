import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CryptoService } from '../common/crypto.service'

@Injectable()
export class MercadoPagoOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  buildAuthUrl(restauranteId: string): string {
    const params = new URLSearchParams({
      client_id: process.env.MP_CLIENT_ID!,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: `${process.env.BASE_URL}/payments/mercadopago/oauth/callback`,
      state: restauranteId,
    })
    return `https://auth.mercadopago.com/authorization?${params.toString()}`
  }

  async handleCallback(code: string, restauranteId: string) {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.MP_CLIENT_ID,
        client_secret: process.env.MP_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.BASE_URL}/payments/mercadopago/oauth/callback`,
      }),
    })

    if (!res.ok) {
      throw new BadRequestException('No se pudo intercambiar el código de OAuth con Mercado Pago')
    }

    const data = await res.json()

    await this.prisma.restaurante.update({
      where: { id: restauranteId },
      data: {
        mpAccessToken: this.crypto.encrypt(data.access_token),
        mpRefreshToken: this.crypto.encrypt(data.refresh_token),
        mpUserId: String(data.user_id),
        mpTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    })

    return { conectado: true }
  }

  async getAccessTokenDecrypted(restauranteId: string): Promise<string> {
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: { mpAccessToken: true, mpTokenExpiresAt: true, mpRefreshToken: true },
    })
    if (!restaurante?.mpAccessToken) {
      throw new BadRequestException('Este restaurante no tiene Mercado Pago conectado')
    }
    return this.crypto.decrypt(restaurante.mpAccessToken)
  }
}
