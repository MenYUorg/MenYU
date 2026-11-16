/** El tope del backend para la propina de un cobro (`Pago.propina` es Decimal(10, 2)). */
export const PROPINA_MAXIMA = 99_999_999.99

export type PropinaLeida = { ok: true; valor?: number } | { ok: false; mensaje: string }

/**
 * Lee la propina que escribe el personal en el cobro (#358). Vacía, o en 0, es válida y sin valor: no se manda. Acepta
 * dígitos con coma o punto decimal y hasta 2 decimales, sin separador de miles. La propina no suma al total de la mesa.
 */
export function parsearPropina(texto: string): PropinaLeida {
  const limpio = texto.trim()
  if (limpio === '') return { ok: true }
  if (limpio.startsWith('-')) return { ok: false, mensaje: 'La propina no puede ser negativa' }
  if (/^\d+[.,]\d{3,}$/.test(limpio)) return { ok: false, mensaje: 'La propina admite hasta 2 decimales' }
  if (!/^\d+([.,]\d{1,2})?$/.test(limpio)) {
    return { ok: false, mensaje: 'Escribí la propina solo con números, con coma o punto para los decimales' }
  }

  const valor = Number(limpio.replace(',', '.'))
  if (valor > PROPINA_MAXIMA) return { ok: false, mensaje: 'La propina no puede superar $99.999.999,99' }
  return valor === 0 ? { ok: true } : { ok: true, valor }
}
