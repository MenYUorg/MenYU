// Asistente de mesa (docs/asistente/specs/asistente.md): los datos que carga el dueño desde web-admin y lee el
// asistente. Todos opcionales: null (o una lista vacía) = sin dato, y el asistente dice que no lo tiene.

export type TamanioPorcion = 'INDIVIDUAL' | 'PARA_COMPARTIR' | 'PARA_N_PERSONAS'
export type Temperatura = 'CALIENTE' | 'FRIO' | 'AMBIENTE'
export type NivelPicante = 'NADA' | 'SUAVE' | 'MEDIO' | 'ALTO'
export type EtiquetaDietaria = 'VEGETARIANO' | 'VEGANO' | 'SIN_TACC' | 'SIN_LACTOSA'

/** Los datos del plato para el asistente. `PATCH /items/:id` los acepta; null borra cada uno. */
export interface DatosDelPlatoParaElAsistente {
  tamanioPorcion: TamanioPorcion | null
  /** Para cuántas personas. Solo con `PARA_N_PERSONAS`: con otro tamaño, el backend lo borra al guardar. */
  porcionPersonas: number | null
  /** Texto libre: "300 g", "3 unidades". */
  porcionDetalle: string | null
  temperatura: Temperatura | null
  nivelPicante: NivelPicante | null
  acompanamiento: string | null
  tiempoPreparacionMin: number | null
  /** Vacía = sin etiquetas declaradas. Es aparte del catálogo de clasificaciones (el filtro "Dietas" de la carta). */
  etiquetasDietarias: EtiquetaDietaria[]
  infoAdicional: string | null
}

/**
 * `GET` y `PUT /restaurantes/:restauranteId/informacion-local`. El `PUT` es un upsert parcial: lo que no viene no
 * cambia y null lo borra. Los servicios son tri-estado: `true`/`false` si el local lo declaró, null si no.
 */
export interface InformacionLocal {
  restauranteId: string
  /** Prende el asistente en la carta de web-cliente. Sin nada cargado, apagado. */
  asistenteHabilitado: boolean
  horarios: string | null
  formasPago: string | null
  wifi: boolean | null
  petFriendly: boolean | null
  accesibleSillaRuedas: boolean | null
  opcionesParaChicos: boolean | null
  estacionamiento: boolean | null
}

/** `/restaurantes/:restauranteId/preguntas-frecuentes`: se listan por fecha de creación. */
export interface PreguntaFrecuente {
  id: string
  pregunta: string
  respuesta: string
  createdAt: string
  updatedAt: string
}
