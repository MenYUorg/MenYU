import type { CodigoErrorAsistente } from '@menyu/types'
import type { FallaDelPedido } from './streamDelAsistente'

// Qué ve el comensal cuando el asistente no responde (docs/asistente/specs/asistente.md, Fases 5 y 6). Siempre un texto
// propio, con voseo y qué hacer, y nunca un hilo roto: el aviso queda debajo de la pregunta, en la conversación.

export interface Aviso {
  texto: string
  /** Ofrece "Reintentar", que vuelve a mandar la misma pregunta. */
  reintentable: boolean
  /** Deshabilita el input: en esta mesa, o por hoy, el asistente ya no va a responder. */
  bloquea: boolean
  /** La pregunta vuelve al input, para reescribirla. */
  devolverAlInput: boolean
}

const avisoDe = (texto: string, opciones: Partial<Omit<Aviso, 'texto'>> = {}): Aviso => ({
  texto,
  reintentable: false,
  bloquea: false,
  devolverAlInput: false,
  ...opciones,
})

const NO_PUDO = avisoDe('El asistente no pudo responder. Probá de nuevo.', { reintentable: true })
const MOMENTANEO = avisoDe('El asistente tiene muchas consultas en este momento. Probá de nuevo en unos minutos.', {
  reintentable: true,
})

/** Los errores con `{ codigo, mensaje }` del backend. `mensaje` es el del servidor (el de `limite_ip` trae los minutos). */
function avisoDelCodigo(codigo: CodigoErrorAsistente, mensaje: string): Aviso {
  switch (codigo) {
    case 'limite_sesion':
      return avisoDe('Llegaste al límite de preguntas al asistente en esta mesa. Para otras consultas, preguntale al mozo.', {
        bloquea: true,
      })
    case 'no_disponible_hoy':
      return avisoDe('El asistente no está disponible por hoy. Para cualquier consulta, preguntale al mozo.', { bloquea: true })
    case 'asistente_deshabilitado':
      return avisoDe('El asistente ya no está disponible en este restaurante. Para cualquier consulta, preguntale al mozo.', {
        bloquea: true,
      })
    case 'limite_ip':
      return avisoDe(mensaje.trim() || 'Hiciste muchas preguntas seguidas. Probá de nuevo en unos minutos.')
    case 'no_disponible_momentaneamente':
      return MOMENTANEO
    case 'pregunta_larga':
      return avisoDe('Tu pregunta es muy larga. Probá con una más corta.', { devolverAlInput: true })
    case 'pregunta_invalida':
      return avisoDe('Escribí una pregunta para el asistente.', { devolverAlInput: true })
    // `sesion_invalida` ya se reintentó sin el token (ver asistenteStore): si vuelve, es un error como cualquier otro. El
    // `default` es para un código que esta versión de la app no conoce (el cuerpo llega del servidor).
    case 'sesion_invalida':
    case 'error_del_asistente':
    default:
      return NO_PUDO
  }
}

export function avisoDeLaFalla(falla: Exclude<FallaDelPedido, { tipo: 'cancelada' }>): Aviso {
  switch (falla.tipo) {
    case 'red':
      return avisoDe('No pudimos conectarnos con el asistente. Revisá tu conexión y probá de nuevo.', { reintentable: true })
    case 'rechazo':
      if (falla.error) return avisoDelCodigo(falla.error.codigo, falla.error.mensaje)
      // Un 400 sin código es el de la validación del pedido: reenviarlo igual daría lo mismo.
      if (falla.status === 400) {
        return avisoDe('No pudimos enviar esa pregunta. Probá escribirla de otra forma.', { devolverAlInput: true })
      }
      return NO_PUDO
    case 'cortada':
      return falla.error?.codigo === 'no_disponible_momentaneamente'
        ? MOMENTANEO
        : avisoDe('La respuesta se cortó. Probá de nuevo.', { reintentable: true })
    case 'vacia':
      return avisoDe('El asistente no pudo responder esa pregunta. Probá escribirla de otra forma o preguntale al mozo.', {
        devolverAlInput: true,
      })
  }
}
