import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PaymentProvider } from './providers/payment-provider.interface'
import { InitiatePaymentDto } from './dto/initiate-payment.dto'

interface SessionJwt {
  sub: string
  tipo: string
  sesionId: string
  mesaId: string
  restauranteId: string
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject('PAYMENT_PROVIDER') private readonly provider: PaymentProvider,
    private readonly jwt: JwtService,
  ) {}

  async initiatePayment(authHeader: string | undefined, dto: InitiatePaymentDto) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Session JWT requerido')
    }

    let payload: SessionJwt
    try {
      payload = this.jwt.verify<SessionJwt>(authHeader.slice(7))
    } catch {
      throw new UnauthorizedException('Session JWT inválido o expirado')
    }

    if (payload.tipo !== 'cliente') {
      throw new UnauthorizedException('Solo clientes pueden iniciar pagos')
    }

    const externalReference = `${dto.sesionId}-${Date.now()}`

    return this.provider.createPreference({
      sesionId: dto.sesionId,
      monto: dto.monto,
      descripcion: dto.descripcion,
      externalReference,
    })
  }

  async handleWebhook(payload: unknown) {
    return this.provider.processWebhook(payload)
  }

  async getStatus(externalId: string) {
    return this.provider.getPaymentStatus(externalId)
  }
}
