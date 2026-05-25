import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import MercadoPagoConfig, { Payment, Preference } from 'mercadopago'
import {
  CreatePaymentDto,
  PaymentPreference,
  PaymentProvider,
  PaymentStatus,
  WebhookResult,
} from './payment-provider.interface'

@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  private readonly client: MercadoPagoConfig

  constructor() {
    this.client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN!,
    })
  }

  async createPreference(data: CreatePaymentDto): Promise<PaymentPreference> {
    const localClient = new MercadoPagoConfig({ accessToken: data.accessToken })
    const result = await new Preference(localClient).create({
      body: {
        external_reference: data.externalReference,
        items: [
          {
            id: data.sesionId,
            title: data.descripcion,
            quantity: 1,
            unit_price: data.monto,
            currency_id: 'ARS',
          },
        ],
        back_urls: {
          success: process.env.MP_SUCCESS_URL ?? 'http://localhost:3000',
          failure: process.env.MP_FAILURE_URL ?? 'http://localhost:3000',
          pending: process.env.MP_PENDING_URL ?? 'http://localhost:3000',
        },
        auto_return: 'approved',
        notification_url: process.env.MP_WEBHOOK_URL ?? undefined,
      },
    })

    if (!result.id || !result.init_point) {
      throw new InternalServerErrorException('MP: preference inválida')
    }

    return {
      id: result.id,
      initPoint: result.init_point,
      externalReference: data.externalReference,
    }
  }

  async processWebhook(payload: unknown): Promise<WebhookResult> {
    const mp = payload as { type?: string; data?: { id?: string } }

    if (mp.type !== 'payment') {
      return { externalId: '', status: 'PENDIENTE', externalReference: '' }
    }

    const paymentId = mp.data?.id
    if (!paymentId) {
      return { externalId: '', status: 'PENDIENTE', externalReference: '' }
    }

    const result = await new Payment(this.client).get({ id: paymentId })

    return {
      externalId: String(result.id ?? ''),
      status: this.mapStatus(result.status),
      externalReference: result.external_reference ?? '',
    }
  }

  async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
    try {
      const result = await new Payment(this.client).get({ id: externalId })
      return this.mapStatus(result.status)
    } catch {
      throw new NotFoundException(`Pago ${externalId} no encontrado`)
    }
  }

  private mapStatus(status: string | undefined | null): PaymentStatus {
    switch (status) {
      case 'approved':
        return 'APROBADO'
      case 'rejected':
        return 'RECHAZADO'
      case 'in_process':
      case 'pending':
        return 'EN_PROCESO'
      default:
        return 'PENDIENTE'
    }
  }
}
