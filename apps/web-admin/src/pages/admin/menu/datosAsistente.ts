import type {
  DatosDelPlatoParaElAsistente,
  EtiquetaDietaria,
  ItemMenu,
  NivelPicante,
  TamanioPorcion,
  Temperatura,
} from '@menyu/types'

// Los datos del plato para el asistente de mesa (docs/asistente/specs/asistente.md). Todos opcionales: lo que queda
// vacío se manda en null (null borra; sin mandarlo, el backend no lo cambiaría) y el asistente dice que no lo sabe.

/** Los mismos topes que valida el backend (`UpdateItemDto`). */
export const LIMITES_DATOS_ASISTENTE = {
  porcionPersonas: { min: 1, max: 100 },
  tiempoPreparacionMin: { min: 1, max: 600 },
  porcionDetalle: 100,
  acompanamiento: 200,
  infoAdicional: 500,
} as const

export const OPCIONES_TAMANIO: { valor: TamanioPorcion; texto: string }[] = [
  { valor: 'INDIVIDUAL', texto: 'Individual' },
  { valor: 'PARA_COMPARTIR', texto: 'Para compartir' },
  { valor: 'PARA_N_PERSONAS', texto: 'Para N personas' },
]

export const OPCIONES_TEMPERATURA: { valor: Temperatura; texto: string }[] = [
  { valor: 'CALIENTE', texto: 'Caliente' },
  { valor: 'FRIO', texto: 'Frío' },
  { valor: 'AMBIENTE', texto: 'A temperatura ambiente' },
]

export const OPCIONES_PICANTE: { valor: NivelPicante; texto: string }[] = [
  { valor: 'NADA', texto: 'No pica' },
  { valor: 'SUAVE', texto: 'Suave' },
  { valor: 'MEDIO', texto: 'Medio' },
  { valor: 'ALTO', texto: 'Alto' },
]

export const OPCIONES_ETIQUETAS: { valor: EtiquetaDietaria; texto: string }[] = [
  { valor: 'VEGETARIANO', texto: 'Vegetariano' },
  { valor: 'VEGANO', texto: 'Vegano' },
  { valor: 'SIN_TACC', texto: 'Sin TACC' },
  { valor: 'SIN_LACTOSA', texto: 'Sin lactosa' },
]

/** Lo que muestra el formulario: textos tal cual se escriben y `''` = sin dato en las opciones. */
export interface FormularioDatosAsistente {
  tamanioPorcion: TamanioPorcion | ''
  porcionPersonas: string
  porcionDetalle: string
  temperatura: Temperatura | ''
  nivelPicante: NivelPicante | ''
  acompanamiento: string
  tiempoPreparacionMin: string
  etiquetasDietarias: EtiquetaDietaria[]
  infoAdicional: string
}

export const FORMULARIO_DATOS_VACIO: FormularioDatosAsistente = {
  tamanioPorcion: '',
  porcionPersonas: '',
  porcionDetalle: '',
  temperatura: '',
  nivelPicante: '',
  acompanamiento: '',
  tiempoPreparacionMin: '',
  etiquetasDietarias: [],
  infoAdicional: '',
}

export function formularioDesdeItem(item: ItemMenu | null): FormularioDatosAsistente {
  if (!item) return FORMULARIO_DATOS_VACIO
  const tamanio = item.tamanioPorcion ?? ''
  return {
    tamanioPorcion: tamanio,
    // Solo vale con PARA_N_PERSONAS: lo cargado por fuera de la API (SQL, seed) podría no cumplirlo.
    porcionPersonas: tamanio === 'PARA_N_PERSONAS' && item.porcionPersonas != null ? String(item.porcionPersonas) : '',
    porcionDetalle: item.porcionDetalle ?? '',
    temperatura: item.temperatura ?? '',
    nivelPicante: item.nivelPicante ?? '',
    acompanamiento: item.acompanamiento ?? '',
    tiempoPreparacionMin: item.tiempoPreparacionMin != null ? String(item.tiempoPreparacionMin) : '',
    etiquetasDietarias: item.etiquetasDietarias ?? [],
    infoAdicional: item.infoAdicional ?? '',
  }
}

/** Cambiar el tamaño a otro que no sea "para N personas" vacía la cantidad: lo que se ve es lo que se guarda. */
export function conTamanio(formulario: FormularioDatosAsistente, tamanio: TamanioPorcion | ''): FormularioDatosAsistente {
  return {
    ...formulario,
    tamanioPorcion: tamanio,
    porcionPersonas: tamanio === 'PARA_N_PERSONAS' ? formulario.porcionPersonas : '',
  }
}

/** Un entero dentro del rango; null si el campo está vacío y undefined si no es válido. */
function entero(texto: string, { min, max }: { min: number; max: number }): number | null | undefined {
  const limpio = texto.trim()
  if (!limpio) return null
  if (!/^\d+$/.test(limpio)) return undefined
  const numero = Number(limpio)
  return numero >= min && numero <= max ? numero : undefined
}

/** El motivo por el que no se puede guardar, o null si está todo bien (así no se llega a un 400 de la API). */
export function errorDatosAsistente(formulario: FormularioDatosAsistente): string | null {
  const { porcionPersonas, tiempoPreparacionMin } = LIMITES_DATOS_ASISTENTE
  if (formulario.tamanioPorcion === 'PARA_N_PERSONAS' && entero(formulario.porcionPersonas, porcionPersonas) === undefined) {
    return `La cantidad de personas tiene que ser un número entero de ${porcionPersonas.min} a ${porcionPersonas.max}.`
  }
  if (entero(formulario.tiempoPreparacionMin, tiempoPreparacionMin) === undefined) {
    return `El tiempo de preparación va en minutos enteros, de ${tiempoPreparacionMin.min} a ${tiempoPreparacionMin.max}.`
  }
  return null
}

/** El cuerpo del `PATCH /items/:id`: van todos los campos, con null en los vacíos. */
export function datosParaGuardar(formulario: FormularioDatosAsistente): DatosDelPlatoParaElAsistente {
  const texto = (valor: string) => valor.trim() || null
  const elegidas = new Set(formulario.etiquetasDietarias)
  return {
    tamanioPorcion: formulario.tamanioPorcion || null,
    // Con otro tamaño el backend lo borraría igual: se manda null para no dar a entender que se guardó.
    porcionPersonas:
      formulario.tamanioPorcion === 'PARA_N_PERSONAS'
        ? (entero(formulario.porcionPersonas, LIMITES_DATOS_ASISTENTE.porcionPersonas) ?? null)
        : null,
    porcionDetalle: texto(formulario.porcionDetalle),
    temperatura: formulario.temperatura || null,
    nivelPicante: formulario.nivelPicante || null,
    acompanamiento: texto(formulario.acompanamiento),
    tiempoPreparacionMin: entero(formulario.tiempoPreparacionMin, LIMITES_DATOS_ASISTENTE.tiempoPreparacionMin) ?? null,
    etiquetasDietarias: OPCIONES_ETIQUETAS.map((o) => o.valor).filter((valor) => elegidas.has(valor)),
    infoAdicional: texto(formulario.infoAdicional),
  }
}

/** Si hay algo para guardar (en el alta, sin datos no hace falta el `PATCH`). */
export function hayDatosAsistente(formulario: FormularioDatosAsistente): boolean {
  return Object.values(datosParaGuardar(formulario)).some((valor) =>
    Array.isArray(valor) ? valor.length > 0 : valor !== null,
  )
}
