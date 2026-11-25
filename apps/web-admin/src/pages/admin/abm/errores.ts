import { ApiError } from '../../../services/api'
import type { ConfigDeAbm } from './tipos'

export interface ErrorDeAbm {
  mensaje: string
  /** Va junto al campo del nombre (el 409 de nombre repetido), no como error general de la fila o del alta. */
  delNombre: boolean
  /** La lista quedó vieja: el ítem ya no existe (404) o hay un conflicto que lo cambió (409). Hay que releerla. */
  releer: boolean
}

export type ReglasDeErrores = Pick<ConfigDeAbm, 'noEncontrada' | 'mensajeNombreRepetido' | 'esConflictoQueReleer'>

/**
 * Qué hacer con el error de una operación sobre un ítem del ABM. Un 409 que no es de nombre repetido ni de los que
 * obligan a releer, y cualquier otro error del servidor, son errores comunes que se pueden reintentar; sin respuesta
 * del servidor, `porDefecto`.
 */
export function errorDeAbm(e: unknown, porDefecto: string, reglas: ReglasDeErrores): ErrorDeAbm {
  if (!(e instanceof ApiError)) return { mensaje: porDefecto, delNombre: false, releer: false }
  if (e.status === 404) return { mensaje: reglas.noEncontrada, delNombre: false, releer: true }
  if (e.status === 409 && e.message === reglas.mensajeNombreRepetido) return { mensaje: e.message, delNombre: true, releer: false }
  if (e.status === 409 && reglas.esConflictoQueReleer(e.message)) return { mensaje: e.message, delNombre: false, releer: true }
  return { mensaje: e.message || porDefecto, delNombre: false, releer: false }
}
