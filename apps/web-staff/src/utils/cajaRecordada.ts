import type { CajaAbierta } from '@menyu/types'

const claveDeLaCaja = (restauranteId: string) => `menyu-staff-caja-id:${restauranteId}`

/**
 * La última caja en la que cobró la persona en este restaurante, si sigue entre las abiertas. Sin localStorage (modo
 * privado, almacenamiento bloqueado) no hay recordada.
 */
export function cajaRecordada(restauranteId: string, cajas: CajaAbierta[] | null): string | null {
  let cajaId: string | null
  try {
    cajaId = localStorage.getItem(claveDeLaCaja(restauranteId))
  } catch {
    return null
  }
  return cajaId && cajas?.some((c) => c.cajaId === cajaId) ? cajaId : null
}

/** Recuerda la caja elegida para el próximo cobro en este restaurante. Si no se puede guardar, no pasa nada. */
export function recordarCaja(restauranteId: string, cajaId: string): void {
  try {
    localStorage.setItem(claveDeLaCaja(restauranteId), cajaId)
  } catch {
    // Sin localStorage la caja no se recuerda: la persona la elige en cada cobro.
  }
}
