import type { CajaAbierta } from '@menyu/types'

/** Qué hace el cobro con las cajas abiertas del turno (#358 y #359). */
export interface CajaParaElCobro {
  /** No hay un turno abierto: el cobro no se puede confirmar (el backend respondería 400). */
  sinTurno: boolean
  /** Hay dos o más cajas abiertas: la persona elige en cuál cobra. */
  mostrarSelector: boolean
  /** El `cajaId` que viaja en el cobro: solo con dos o más cajas, y solo si la elegida sigue abierta. */
  cajaId?: string
  /** Con dos o más cajas, falta elegir una que esté abierta: el cobro no se puede confirmar. */
  falta: boolean
}

/**
 * La caja de un cobro, a partir de las cajas abiertas y la elegida. Con `cajas` en null (no se pudieron leer) no se
 * bloquea nada ni se manda `cajaId`: decide el backend. Con una sola caja tampoco se manda: el backend usa esa.
 */
export function cajaDelCobro(cajas: CajaAbierta[] | null, elegida: string | null): CajaParaElCobro {
  if (cajas === null || cajas.length === 1) return { sinTurno: false, mostrarSelector: false, falta: false }
  if (cajas.length === 0) return { sinTurno: true, mostrarSelector: false, falta: false }

  const abierta = elegida !== null && cajas.some((c) => c.cajaId === elegida)
  return abierta
    ? { sinTurno: false, mostrarSelector: true, cajaId: elegida, falta: false }
    : { sinTurno: false, mostrarSelector: true, falta: true }
}
