import { ApiError } from '../../../services/api'

/** El 409 de un nombre repetido: apps/backend/src/caja/cajas.service.ts (MENSAJE_NOMBRE_REPETIDO). */
export const MENSAJE_NOMBRE_REPETIDO = 'Ya hay una caja con ese nombre en este restaurante'
/** El 409 de desactivar una caja abierta: apps/backend/src/caja/cajas.service.ts (MENSAJE_CAJA_ABIERTA). */
export const MENSAJE_CAJA_ABIERTA = 'No se puede desactivar una caja con el turno abierto'

export interface ErrorDeCaja {
  mensaje: string
  /** Va junto al campo del nombre (el 409 de nombre repetido), no como error general de la fila o del alta. */
  delNombre: boolean
  /** La lista quedó vieja: la caja ya no existe (404) o está abierta en el turno (409). Hay que releerla. */
  releer: boolean
}

/**
 * Qué hacer con el error de una operación sobre una caja (#360). El 409 de operación simultánea y cualquier otro error
 * del servidor son errores comunes, que se pueden reintentar; sin respuesta del servidor, `porDefecto`.
 */
export function errorDeCaja(e: unknown, porDefecto: string): ErrorDeCaja {
  if (!(e instanceof ApiError)) return { mensaje: porDefecto, delNombre: false, releer: false }
  if (e.status === 404) return { mensaje: 'Caja no encontrada', delNombre: false, releer: true }
  if (e.status === 409 && e.message === MENSAJE_NOMBRE_REPETIDO) return { mensaje: e.message, delNombre: true, releer: false }
  if (e.status === 409 && e.message === MENSAJE_CAJA_ABIERTA) return { mensaje: e.message, delNombre: false, releer: true }
  return { mensaje: e.message || porDefecto, delNombre: false, releer: false }
}
