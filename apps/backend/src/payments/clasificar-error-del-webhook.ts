import { Prisma } from '@prisma/client'

/**
 * El restaurante de la URL no tiene Mercado Pago conectado: sin su token no se puede consultar la notificación.
 * Es un error propio para que la clasificación no lo confunda con un 400 de Mercado Pago.
 */
export class MercadoPagoNoConectadoError extends Error {
  constructor() {
    super('El restaurante no tiene Mercado Pago conectado')
    this.name = 'MercadoPagoNoConectadoError'
  }
}

export type CodigoDelWebhook =
  | 'mp-no-conectado'
  | 'mp-token-invalido'
  | 'mp-solicitud-invalida'
  | 'mp-no-encontrado'
  | 'mp-limite'
  | 'mp-servidor'
  | 'mp-otro'
  | 'red'
  | 'timeout'
  | 'prisma'
  | 'desconocido'

export interface ClasificacionDelWebhook {
  /** 200: la notificación no se puede procesar nunca, MP no tiene que reintentar. 500: MP reintenta (unos 4 días). */
  respuesta: 200 | 500
  codigo: CodigoDelWebhook
  /** El status HTTP que devolvió Mercado Pago, si el error vino de su API. */
  status?: number
  /** Qué tiene que hacer alguien para que se arregle, cuando no se arregla solo. */
  accion?: string
}

const RECONECTAR = 'reconectar Mercado Pago desde el panel del restaurante'

const ERRORES_DE_PRISMA = [
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientValidationError,
]

/**
 * El SDK de Mercado Pago (3.2.0) tira el cuerpo de la respuesta parseado, un objeto plano y no un `Error`, con el
 * `status` HTTP adentro. Un `HttpException` de Nest también tiene `status`: por eso se exige que no sea un `Error`.
 */
function statusDeMercadoPago(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || err instanceof Error) return undefined
  const status = Number((err as { status?: unknown }).status)
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined
}

/**
 * Qué responderle a Mercado Pago cuando procesar una notificación falla (DT-11). La única regla de clasificación: el
 * controller responde lo que diga esta función. Lo que no se puede procesar nunca ya lo resuelve el servicio sin
 * lanzar (pago inexistente, de otro restaurante, que no es de MP, externalReference distinto, tópico desconocido).
 */
export function clasificarErrorDelWebhook(err: unknown): ClasificacionDelWebhook {
  if (err instanceof MercadoPagoNoConectadoError) return { respuesta: 500, codigo: 'mp-no-conectado', accion: RECONECTAR }
  if (ERRORES_DE_PRISMA.some((clase) => err instanceof clase)) return { respuesta: 500, codigo: 'prisma' }

  const status = statusDeMercadoPago(err)
  if (status !== undefined) {
    // Un 400 es un pedido que MP nunca va a aceptar (p. ej. un id mal formado): reintentar no lo arregla.
    if (status === 400) return { respuesta: 200, codigo: 'mp-solicitud-invalida', status }
    if (status === 401 || status === 403) return { respuesta: 500, codigo: 'mp-token-invalido', status, accion: RECONECTAR }
    if (status === 404) return { respuesta: 500, codigo: 'mp-no-encontrado', status }
    if (status === 429) return { respuesta: 500, codigo: 'mp-limite', status }
    if (status >= 500) return { respuesta: 500, codigo: 'mp-servidor', status }
    return { respuesta: 500, codigo: 'mp-otro', status }
  }

  // El SDK corta cada intento con un AbortController: el fetch rechaza con un DOMException `AbortError`.
  const nombre = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined
  if (nombre === 'AbortError' || nombre === 'TimeoutError') return { respuesta: 500, codigo: 'timeout' }
  // Un fallo de red en el fetch de Node es un TypeError "fetch failed" con la causa adentro. Otro TypeError es un bug.
  if (err instanceof TypeError && (err.message === 'fetch failed' || (err as { cause?: unknown }).cause !== undefined)) {
    return { respuesta: 500, codigo: 'red' }
  }

  return { respuesta: 500, codigo: 'desconocido' }
}

/** El mensaje del error para el log: de una línea y recortado. Nunca el objeto entero (puede traer headers o el token). */
export function mensajeDelError(err: unknown): string {
  const mensaje =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : ''
  return mensaje.replace(/\s+/g, ' ').trim().slice(0, 300)
}
