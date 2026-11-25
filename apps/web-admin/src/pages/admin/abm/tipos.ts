/** Lo mínimo que el ABM común necesita de lo que administra (una caja, una comanda). */
export interface ItemDelAbm {
  id: string
  nombre: string
  activa: boolean
}

/** Por qué un ítem no se puede desactivar ahora: la pastilla de la fila y el texto de ayuda asociado al botón. */
export interface Bloqueo {
  pastilla: string
  ayuda: string
}

/**
 * Todo lo que cambia entre un ABM y otro. Los textos son literales completos (no plantillas): el género y los
 * artículos cambian de una entidad a otra.
 */
export interface ConfigDeAbm {
  /** Título de la tarjeta del alta ("Nueva caja"). */
  tituloDelAlta: string
  /** El texto de ayuda de la tarjeta del alta. */
  ayudaDelAlta: string
  /** Título de la tarjeta de la lista ("Cajas"). */
  tituloDeLaLista: string
  /** Lo que se muestra cuando no hay ítems. */
  textoVacio: string
  ariaLabelDeLaLista: string
  /** El nombre accesible de la lectura en curso ("Cargando las cajas"). */
  etiquetaDeCarga: string
  /** El error de lectura cuando el error no trae mensaje. */
  errorDeLecturaPorDefecto: string
  /** Lo que se muestra sin restaurante elegido. */
  seleccionaRestaurante: string
  /** La etiqueta del campo del nombre ("Nombre de la caja"). */
  etiquetaDelCampo: string
  placeholderDelAlta: string
  textoDelBotonDeAlta: string
  maximoDelNombre: number
  mensajeNombreVacio: string
  errorAlCrear: string
  errorAlRenombrar: string
  errorAlActivar: string
  errorAlDesactivar: string
  /** El texto del 404. */
  noEncontrada: string
  /** El 409 de un nombre repetido, tal como lo manda el backend. */
  mensajeNombreRepetido: string
  /** Un 409 (que no es de nombre repetido) que deja la lista vieja y obliga a releerla. */
  esConflictoQueReleer: (mensaje: string) => boolean
  /** La pregunta de la confirmación de desactivar; `etiqueta` es el nombre entre «». */
  textoDeConfirmacion: (etiqueta: string) => string
}
