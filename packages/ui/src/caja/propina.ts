import { leerMonto, MONTO_MAXIMO, type ErrorDeMonto } from './monto'

/** El tope del backend para la propina de un cobro (`Pago.propina` es Decimal(10, 2)). */
export const PROPINA_MAXIMA = MONTO_MAXIMO

export type PropinaLeida = { ok: true; valor?: number } | { ok: false; mensaje: string }

const MENSAJES: Record<ErrorDeMonto, string> = {
  negativo: 'La propina no puede ser negativa',
  decimales: 'La propina admite hasta 2 decimales',
  formato: 'Escribí la propina solo con números, con coma o punto para los decimales',
  tope: 'La propina no puede superar $99.999.999,99',
}

/**
 * Lee la propina que escribe el personal en el cobro (#358). Vacía, o en 0, es válida y sin valor: no se manda. Acepta
 * dígitos con coma o punto decimal y hasta 2 decimales, sin separador de miles. La propina no suma al total de la mesa.
 */
export function parsearPropina(texto: string): PropinaLeida {
  const monto = leerMonto(texto, PROPINA_MAXIMA)
  if (!monto.ok) return { ok: false, mensaje: MENSAJES[monto.error] }
  return monto.valor === null || monto.valor === 0 ? { ok: true } : { ok: true, valor: monto.valor }
}
