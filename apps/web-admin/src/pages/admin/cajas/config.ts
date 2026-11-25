import type { ConfigDeAbm } from '../abm/tipos'

/** El 409 de un nombre repetido: apps/backend/src/caja/cajas.service.ts (MENSAJE_NOMBRE_REPETIDO). */
export const MENSAJE_NOMBRE_REPETIDO = 'Ya hay una caja con ese nombre en este restaurante'
/** El 409 de desactivar una caja abierta: apps/backend/src/caja/cajas.service.ts (MENSAJE_CAJA_ABIERTA). */
export const MENSAJE_CAJA_ABIERTA = 'No se puede desactivar una caja con el turno abierto'

/**
 * El largo máximo del nombre de una caja: `MAX_NOMBRE_CAJA` de apps/backend/src/caja/dto/crear-caja.dto.ts. El backend
 * lo cuenta con `isLength` de validator, que resta los pares sustitutos (un emoji cuenta uno); acá se cuenta con
 * `.length` (unidades UTF-16), que es igual o más estricto: la pantalla nunca acepta un nombre que el backend rechace.
 */
export const MAXIMO_NOMBRE_DE_CAJA = 60

/** Todo lo propio de las cajas en el ABM común (#360): textos y reglas de los errores. */
export const CONFIG_DE_CAJAS: ConfigDeAbm = {
  tituloDelAlta: 'Nueva caja',
  ayudaDelAlta: 'Un turno puede abrir hasta 2 cajas. Una caja no se borra: se desactiva.',
  tituloDeLaLista: 'Cajas',
  textoVacio: 'Todavía no hay cajas. Creá la primera para poder abrir un turno desde la app del personal.',
  ariaLabelDeLaLista: 'Cajas del restaurante',
  etiquetaDeCarga: 'Cargando las cajas',
  errorDeLecturaPorDefecto: 'No se pudieron leer las cajas',
  seleccionaRestaurante: 'Seleccioná un restaurante para ver las cajas',
  etiquetaDelCampo: 'Nombre de la caja',
  placeholderDelAlta: 'Ej: Caja principal',
  textoDelBotonDeAlta: 'Agregar caja',
  maximoDelNombre: MAXIMO_NOMBRE_DE_CAJA,
  mensajeNombreVacio: 'Escribí el nombre de la caja',
  errorAlCrear: 'No se pudo crear la caja',
  errorAlRenombrar: 'No se pudo renombrar la caja',
  errorAlActivar: 'No se pudo activar la caja',
  errorAlDesactivar: 'No se pudo desactivar la caja',
  noEncontrada: 'Caja no encontrada',
  mensajeNombreRepetido: MENSAJE_NOMBRE_REPETIDO,
  // Desactivar una caja abierta en el turno: la lista quedó vieja.
  esConflictoQueReleer: (mensaje) => mensaje === MENSAJE_CAJA_ABIERTA,
  textoDeConfirmacion: (etiqueta) => `¿Desactivar ${etiqueta}? No se va a poder abrir en turnos nuevos. Podés volver a activarla.`,
}
