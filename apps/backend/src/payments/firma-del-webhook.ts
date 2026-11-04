import { InvalidWebhookSignatureError, SignatureFailureReason, WebhookSignatureValidator } from 'mercadopago'

export type ResultadoFirma = 'valida' | 'invalida' | 'no-evaluable'

export interface DatosDeLaFirma {
  /** El header `x-signature` (`ts=…,v1=…`). */
  xSignature: string | string[] | undefined
  /** El header `x-request-id`. */
  xRequestId: string | string[] | undefined
  /** El parámetro `data.id` de la query (no el `id` de las notificaciones IPN). */
  dataId: string | string[] | undefined
  /** La clave secreta de la aplicación en Tus integraciones (`MP_WEBHOOK_SECRET`). */
  secret: string
}

// Lo que no se puede evaluar: falta el header, o no tiene la forma `ts=…,v1=…`. No dice nada de quién la mandó.
const NO_EVALUABLE: ReadonlySet<string> = new Set([
  SignatureFailureReason.MissingSignatureHeader,
  SignatureFailureReason.MalformedSignatureHeader,
  SignatureFailureReason.MissingTimestamp,
  SignatureFailureReason.MissingHash,
])

/**
 * Evalúa la firma de una notificación de Mercado Pago (DT-02, modo observación) con el validador del SDK: HMAC-SHA256
 * en hexa sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, sin los pares que falten, comparado en tiempo
 * constante con el `v1` del header. Sin tolerancia del `ts`: las fuentes no coinciden en si va en segundos o en
 * milisegundos, y en modo observación no hace falta.
 *
 * Es pura: no loguea y nunca lanza. Cualquier error que no sea del validador (por ejemplo, `timingSafeEqual` con un
 * `v1` que no es hexa y ocupa otra cantidad de bytes) cuenta como firma inválida.
 */
export function evaluarFirmaDelWebhook({ xSignature, xRequestId, dataId, secret }: DatosDeLaFirma): ResultadoFirma {
  if (!secret) return 'no-evaluable'
  try {
    WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret })
    return 'valida'
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError && NO_EVALUABLE.has(err.reason)) return 'no-evaluable'
    return 'invalida'
  }
}
