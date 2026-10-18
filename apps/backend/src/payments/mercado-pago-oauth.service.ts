import { Injectable, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { CryptoService } from '../common/crypto.service'
import { assertStaffAccess } from '../common/assert-staff-access'
import { JwtPayload } from '../auth/auth.service'

// El state de OAuth es un JWT propio: con otra clave que la de login (no sirve como token de sesión ni al revés),
// un audience fijo y 10 minutos de vida, lo que dura ir a Mercado Pago, autorizar y volver.
const STATE_AUDIENCE = 'mp-oauth-state'
const STATE_VIDA = '10m'

interface StateOAuth {
  restauranteId: string
  adminId: string
}

@Injectable()
export class MercadoPagoOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
  ) {}

  async buildAuthUrl(restauranteId: string, user: JwtPayload): Promise<string> {
    await assertStaffAccess(this.prisma, restauranteId, user)

    const state: StateOAuth = { restauranteId, adminId: user.sub }
    const params = new URLSearchParams({
      client_id: process.env.MP_CLIENT_ID!,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: `${process.env.BASE_URL}/payments/mercadopago/oauth/callback`,
      state: this.jwt.sign(state, { secret: this.claveState(), audience: STATE_AUDIENCE, expiresIn: STATE_VIDA }),
    })
    return `https://auth.mercadopago.com/authorization?${params.toString()}`
  }

  async handleCallback(code: string, state: string) {
    const { restauranteId } = this.leerState(state)

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

  private claveState(): string {
    return `${process.env.JWT_SECRET}:${STATE_AUDIENCE}`
  }

  private leerState(state: string): StateOAuth {
    try {
      const datos = this.jwt.verify<StateOAuth>(state, { secret: this.claveState(), audience: STATE_AUDIENCE })
      if (typeof datos.restauranteId !== 'string') throw new Error('state sin restaurante')
      return datos
    } catch {
      throw new BadRequestException('La conexión con Mercado Pago no es válida o venció. Volvé a intentarlo.')
    }
  }
}
