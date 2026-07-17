import { Injectable } from '@nestjs/common'
import { MercadoPagoConfig, Preference, Payment, MerchantOrder } from 'mercadopago'
import {
  PaymentProvider,
  CreatePaymentDto,
  PaymentPreference,
  WebhookResult,
  PaymentStatus,
} from './payment-provider.interface'

@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  private client(accessToken: string) {
    return new MercadoPagoConfig({ accessToken })
  }

  async createPreference(data: CreatePaymentDto): Promise<PaymentPreference> {
    const client = this.client(data.accessToken)
    const preferenceClient = new Preference(client)

    const notificationUrl =
      `${process.env.BASE_URL}/payments/webhook/mercadopago` +
      `/restaurante/${data.restauranteId}/pedido/${data.pedidoId}`

    const successUrl = data.successUrl ?? `${process.env.FRONTEND_URL}/pago/exitoso`
    const failureUrl = data.failureUrl ?? `${process.env.FRONTEND_URL}/pago/fallido`
    const pendingUrl = data.pendingUrl ?? `${process.env.FRONTEND_URL}/pago/pendiente`

    // Mercado Pago exige que las back_urls sean públicas (HTTPS, no localhost)
    // para poder usar auto_return. En desarrollo local (localhost) lo omitimos;
    // en producción (URL pública HTTPS) sí lo incluimos para mejor UX.
    const esUrlPublica = successUrl.startsWith('https://') && !successUrl.includes('localhost')

    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: data.pedidoId,
            title: data.descripcion,
            unit_price: data.monto,
            quantity: 1,
            currency_id: 'ARS',
          },
        ],
        external_reference: data.externalReference,
        notification_url: notificationUrl,
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        ...(esUrlPublica ? { auto_return: 'approved' as const } : {}),
      },
    })

    return {
      id: preference.id!,
      initPoint: preference.init_point!,
      externalReference: data.externalReference,
    }
  }

  async processWebhook(payload: unknown, accessToken: string): Promise<WebhookResult> {
    const query = payload as Record<string, string>
    const client = this.client(accessToken)
    const paymentClient = new Payment(client)
    const merchantOrderClient = new MerchantOrder(client)

    const topic = query.topic ?? query.type
    const id = query.id ?? query['data.id']

    let merchantOrder: any

    if (topic === 'merchant_order') {
      merchantOrder = await merchantOrderClient.get({ merchantOrderId: id })
    } else if (topic === 'payment') {
      const payment = await paymentClient.get({ id })
      const orderId = (payment as any).order?.id
      if (!orderId) {
        return { externalId: id, status: 'PENDIENTE', externalReference: '' }
      }
      merchantOrder = await merchantOrderClient.get({ merchantOrderId: orderId })
    } else {
      return { externalId: id ?? 'desconocido', status: 'PENDIENTE', externalReference: '' }
    }

    const totalPaid = (merchantOrder.payments ?? [])
      .filter((p: any) => p.status === 'approved')
      .reduce((acc: number, p: any) => acc + p.transaction_amount, 0)

    const status: PaymentStatus =
      totalPaid >= merchantOrder.total_amount
        ? 'APROBADO'
        : (merchantOrder.payments ?? []).some((p: any) => p.status === 'in_process')
          ? 'EN_PROCESO'
          : (merchantOrder.payments ?? []).some((p: any) => p.status === 'rejected')
            ? 'RECHAZADO'
            : 'PENDIENTE'

    return {
      externalId: String(merchantOrder.id),
      status,
      externalReference: merchantOrder.external_reference ?? '',
    }
  }

  async getPaymentStatus(externalId: string, accessToken: string): Promise<PaymentStatus> {
    const client = this.client(accessToken)
    const paymentClient = new Payment(client)
    const payment = await paymentClient.get({ id: externalId })

    const map: Record<string, PaymentStatus> = {
      approved: 'APROBADO',
      rejected: 'RECHAZADO',
      in_process: 'EN_PROCESO',
      pending: 'PENDIENTE',
    }
    return map[(payment as any).status] ?? 'PENDIENTE'
  }
}
