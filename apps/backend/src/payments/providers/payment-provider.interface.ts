export type PaymentStatus = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'EN_PROCESO'

export interface CreatePaymentDto {
  sesionId: string
  monto: number
  descripcion: string
  externalReference: string
}

export interface PaymentPreference {
  id: string
  initPoint: string
  externalReference: string
}

export interface WebhookResult {
  externalId: string
  status: PaymentStatus
  externalReference: string
}

export interface PaymentProvider {
  createPreference(data: CreatePaymentDto): Promise<PaymentPreference>
  processWebhook(payload: unknown): Promise<WebhookResult>
  getPaymentStatus(externalId: string): Promise<PaymentStatus>
}
