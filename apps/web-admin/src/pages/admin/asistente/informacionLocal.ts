import type { InformacionLocal } from '@menyu/types'
import type { GuardarInformacionLocalInput } from '../../../services/api'

/** Los mismos topes que valida el backend (van al prompt del asistente en cada pregunta). */
export const LIMITES_INFORMACION = { horarios: 500, formasPago: 200 } as const
export const LIMITES_PREGUNTA = { pregunta: 200, respuesta: 1000 } as const

export type ClaveServicio = 'wifi' | 'petFriendly' | 'accesibleSillaRuedas' | 'opcionesParaChicos' | 'estacionamiento'

export const SERVICIOS: { clave: ClaveServicio; texto: string }[] = [
  { clave: 'wifi', texto: 'Wifi' },
  { clave: 'petFriendly', texto: 'Pet friendly' },
  { clave: 'accesibleSillaRuedas', texto: 'Accesible en silla de ruedas' },
  { clave: 'opcionesParaChicos', texto: 'Opciones para chicos' },
  { clave: 'estacionamiento', texto: 'Estacionamiento' },
]

/** Lo que muestra el formulario. Cada servicio es tri-estado: true o false si el local lo declaró, null si no. */
export interface FormularioInformacion {
  horarios: string
  formasPago: string
  servicios: Record<ClaveServicio, boolean | null>
}

export function formularioDesdeInformacion(informacion: InformacionLocal): FormularioInformacion {
  return {
    horarios: informacion.horarios ?? '',
    formasPago: informacion.formasPago ?? '',
    servicios: {
      wifi: informacion.wifi,
      petFriendly: informacion.petFriendly,
      accesibleSillaRuedas: informacion.accesibleSillaRuedas,
      opcionesParaChicos: informacion.opcionesParaChicos,
      estacionamiento: informacion.estacionamiento,
    },
  }
}

/**
 * El cuerpo del `PUT` del formulario: todos los campos, con los textos vacíos en null (null borra). El interruptor
 * del asistente no va: se guarda aparte, al tocarlo.
 */
export function informacionParaGuardar(formulario: FormularioInformacion): GuardarInformacionLocalInput {
  return {
    horarios: formulario.horarios.trim() || null,
    formasPago: formulario.formasPago.trim() || null,
    ...formulario.servicios,
  }
}

/** Si dos estados del formulario guardarían lo mismo (los espacios de los costados no cuentan). */
export function mismaInformacion(a: FormularioInformacion, b: FormularioInformacion): boolean {
  const x = informacionParaGuardar(a)
  const y = informacionParaGuardar(b)
  return (Object.keys(x) as (keyof GuardarInformacionLocalInput)[]).every((clave) => x[clave] === y[clave])
}
