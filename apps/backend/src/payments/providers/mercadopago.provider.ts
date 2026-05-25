import { Injectable, NotImplementedException } from '@nestjs/common'
import {
  CreatePaymentDto,
  PaymentPreference,
  PaymentProvider,
  PaymentStatus,
  WebhookResult,
} from './payment-provider.interface'

@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  async createPreference(_data: CreatePaymentDto): Promise<PaymentPreference> {
    throw new NotImplementedException('MercadoPago: método no implementado aún')
  }

  async processWebhook(_payload: unknown): Promise<WebhookResult> {
    throw new NotImplementedException('MercadoPago: método no implementado aún')
  }

  async getPaymentStatus(_externalId: string): Promise<PaymentStatus> {
    throw new NotImplementedException('MercadoPago: método no implementado aún')
  }
}
