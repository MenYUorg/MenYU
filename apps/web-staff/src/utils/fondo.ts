import { leerMonto, MONTO_MAXIMO, type ErrorDeMonto } from '@menyu/ui/caja'

export type FondoLeido = { ok: true; valor: number } | { ok: false; mensaje: string }

const MENSAJES: Record<ErrorDeMonto, string> = {
  negativo: 'El fondo inicial no puede ser negativo',
  decimales: 'El fondo inicial admite hasta 2 decimales',
  formato: 'Escribí el fondo inicial solo con números, con coma o punto para los decimales',
  tope: 'El fondo inicial no puede superar $99.999.999,99',
}

/**
 * Lee el fondo inicial de una caja al abrir el turno (#359). Es obligatorio: vacío es un error. 0 es válido y se manda
 * (la caja arranca sin cambio). Mismo formato que la propina: coma o punto decimal, hasta 2 decimales, sin miles.
 */
export function parsearFondo(texto: string): FondoLeido {
  const monto = leerMonto(texto, MONTO_MAXIMO)
  if (!monto.ok) return { ok: false, mensaje: MENSAJES[monto.error] }
  if (monto.valor === null) return { ok: false, mensaje: 'Ingresá el fondo inicial (0 si no hay)' }
  return { ok: true, valor: monto.valor }
}
