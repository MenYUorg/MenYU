import { leerMonto, MONTO_MAXIMO, type ErrorDeMonto } from './monto'

/** El largo máximo del motivo: `MAX_MOTIVO_MOVIMIENTO` de apps/backend/src/caja/dto/registrar-movimiento.dto.ts. */
export const MOTIVO_MAXIMO = 200

export type CampoLeido<T> = { ok: true; valor: T } | { ok: false; mensaje: string }

const MENSAJES: Record<ErrorDeMonto, string> = {
  negativo: 'El monto no puede ser negativo',
  decimales: 'El monto admite hasta 2 decimales',
  formato: 'Escribí el monto solo con números, con coma o punto para los decimales',
  tope: 'El monto no puede superar $99.999.999,99',
}

/**
 * Lee el monto de un ingreso o un egreso de caja (#359). Es obligatorio y mayor a 0. Mismo formato que la propina y el
 * fondo: coma o punto decimal, hasta 2 decimales, sin miles.
 */
export function parsearMontoDeMovimiento(texto: string): CampoLeido<number> {
  const monto = leerMonto(texto, MONTO_MAXIMO)
  if (!monto.ok) return { ok: false, mensaje: MENSAJES[monto.error] }
  if (monto.valor === null) return { ok: false, mensaje: 'Ingresá el monto' }
  if (monto.valor === 0) return { ok: false, mensaje: 'El monto tiene que ser mayor a 0' }
  return { ok: true, valor: monto.valor }
}

/** Lee el motivo de un movimiento: obligatorio y de hasta MOTIVO_MAXIMO caracteres. Se manda recortado. */
export function parsearMotivo(texto: string): CampoLeido<string> {
  const motivo = texto.trim()
  if (motivo === '') return { ok: false, mensaje: 'Escribí el motivo' }
  if (motivo.length > MOTIVO_MAXIMO) return { ok: false, mensaje: `El motivo admite hasta ${MOTIVO_MAXIMO} caracteres` }
  return { ok: true, valor: motivo }
}
