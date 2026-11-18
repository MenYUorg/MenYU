/** El tope del backend para los montos de caja (`Decimal(10, 2)`: propina, fondo inicial). */
export const MONTO_MAXIMO = 99_999_999.99

/** Por qué un texto no es un monto válido. */
export type ErrorDeMonto = 'negativo' | 'decimales' | 'formato' | 'tope'

/** `valor` en `null`: el texto está vacío. Qué hacer con un vacío lo decide cada campo. */
export type MontoLeido = { ok: true; valor: number | null } | { ok: false; error: ErrorDeMonto }

/**
 * Lee un monto que escribe el personal: dígitos con coma o punto decimal y hasta 2 decimales, sin separador de miles ni
 * signos, hasta `maximo`. Los mensajes los arma cada campo (`parsearPropina`, `parsearFondo`).
 */
export function leerMonto(texto: string, maximo: number = MONTO_MAXIMO): MontoLeido {
  const limpio = texto.trim()
  if (limpio === '') return { ok: true, valor: null }
  if (limpio.startsWith('-')) return { ok: false, error: 'negativo' }
  if (/^\d+[.,]\d{3,}$/.test(limpio)) return { ok: false, error: 'decimales' }
  if (!/^\d+([.,]\d{1,2})?$/.test(limpio)) return { ok: false, error: 'formato' }

  const valor = Number(limpio.replace(',', '.'))
  if (valor > maximo) return { ok: false, error: 'tope' }
  return { ok: true, valor }
}
