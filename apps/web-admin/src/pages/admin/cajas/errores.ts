import { errorDeAbm, type ErrorDeAbm } from '../abm/errores'
import { CONFIG_DE_CAJAS, MENSAJE_CAJA_ABIERTA, MENSAJE_NOMBRE_REPETIDO } from './config'

export { MENSAJE_CAJA_ABIERTA, MENSAJE_NOMBRE_REPETIDO }

/** Qué hacer con el error de una operación sobre una caja (#360): ver `ErrorDeAbm`. */
export type ErrorDeCaja = ErrorDeAbm

/**
 * Qué hacer con el error de una operación sobre una caja (#360). El 409 de operación simultánea y cualquier otro error
 * del servidor son errores comunes, que se pueden reintentar; sin respuesta del servidor, `porDefecto`.
 */
export function errorDeCaja(e: unknown, porDefecto: string): ErrorDeCaja {
  const { noEncontrada, mensajeNombreRepetido, esConflictoQueReleer } = CONFIG_DE_CAJAS
  return errorDeAbm(e, porDefecto, { noEncontrada, mensajeNombreRepetido, esConflictoQueReleer })
}
