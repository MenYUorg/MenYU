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
    const isSandbox = process.env.MP_ENV === 'sandbox'
    const isMinimal = process.env.MP_MINIMAL_PREFERENCE === 'true'
    const localClient = new MercadoPagoConfig({ accessToken: data.accessToken })

    // Redondear a 2 decimales — MP rechaza precios con floating point impreciso
    const unitPrice = Math.round(Number(data.monto) * 100) / 100

    const baseItems = [
      {
        id: data.sesionId,
        title: data.descripcion,
        quantity: 1,
        unit_price: unitPrice,
        currency_id: 'ARS',
      },
    ]

    // En sandbox: sin notification_url (no está registrada en la app MP) ni auto_return
    // (triggean la policy "UNAUTHORIZED"). En producción van los dos.
    const preferenceBody = {
      external_reference: data.externalReference,
      items: baseItems,
      ...(data.successUrl && {
        back_urls: {
          success: data.successUrl,
          failure: data.failureUrl ?? data.successUrl,
          pending: data.pendingUrl ?? data.successUrl,
        },
        ...(!isSandbox && { auto_return: 'approved' as const }),
      }),
      ...(!isSandbox && process.env.MP_WEBHOOK_URL && {
        notification_url: process.env.MP_WEBHOOK_URL,
      }),
    }

    console.log('[MP] createPreference → body', {
      MP_ENV: process.env.MP_ENV ?? '(no definida)',
      isSandbox,
      external_reference: data.externalReference,
      unit_price: unitPrice,
      unit_price_original: Number(data.monto),
      currency_id: 'ARS',
      title: data.descripcion,
      has_back_urls: !!data.successUrl,
      back_url_success: data.successUrl ?? '(no definida)',
      has_auto_return: !isSandbox && !!data.successUrl,
      has_notification_url: !isSandbox && !!process.env.MP_WEBHOOK_URL,
    })

    const result = await new Preference(localClient)
      .create({ body: preferenceBody })
      .catch((err: unknown) => {
        const e = err as Record<string, unknown>
        const cause = Array.isArray(e['cause'])
          ? (e['cause'] as Array<{ code?: unknown; description?: string }>)
          : []
        console.error('[MP] createPreference SDK error', JSON.stringify({
          status:     e['status'],
          message:    e['message'],
          blocked_by: e['blocked_by'],
          cause,
          rawKeys:    Object.keys(e),
        }))
        const mpDescription =
          cause[0]?.description ??
          (typeof e['message'] === 'string' && e['message'] !== '[object Object]'
            ? e['message']
            : null) ??
          `status ${String(e['status'] ?? 'desconocido')}`
        throw new InternalServerErrorException(`MP: ${mpDescription}`)
      })

    const selectedInitPoint =
      isSandbox && result.sandbox_init_point
        ? result.sandbox_init_point
        : result.init_point

    const selectedUrlType = isSandbox && result.sandbox_init_point ? 'sandbox_init_point' : 'init_point'
    console.log('[MP] createPreference → response', {
      preference_id: result.id,
      init_point_exists: !!result.init_point,
      sandbox_init_point_exists: !!result.sandbox_init_point,
      selected_url_type: selectedUrlType,
    })

    if (!result.id || !selectedInitPoint) {
      throw new InternalServerErrorException('MP: preference inválida')
    }

    return {
      id: result.id,
      initPoint: selectedInitPoint,
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
