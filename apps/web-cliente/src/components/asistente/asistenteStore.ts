import { create } from 'zustand'
import type { MensajeDelChatAsistente } from '@menyu/types'
import { useSessionStore } from '../../store/sessionStore'
import { avisoDeLaFalla, type Aviso } from './avisos'
import { guardarConversacion, leerConversacion } from './conversacion'
import { pedirRespuesta, type ResultadoDelPedido } from './streamDelAsistente'

// El chat del asistente de la carta (docs/asistente/specs/asistente.md, Fase 6). Vive en un store y no en el panel: una
// respuesta que está llegando sigue llegando aunque se cierre el panel o se abra el detalle de un plato.

/** Tope de preguntas de una conversación. Lo aplica el cliente: el backend no ve la conversación entera (spec, Límites). */
export const MAX_PREGUNTAS_POR_CONVERSACION = 20
/** Mensajes que se le mandan al asistente en cada pregunta (la pregunta incluida). */
export const MENSAJES_POR_PEDIDO = 10
/** El largo máximo de una pregunta (`ASISTENTE_MAX_CARACTERES_PREGUNTA` del backend). */
export const MAX_CARACTERES_PREGUNTA = 500

/** La pregunta que se mandó y lo que va llegando de la respuesta (vacío hasta el primer texto: "escribiendo"). */
export interface IntercambioEnCurso {
  pregunta: string
  respuesta: string
}

/** La última pregunta que no tuvo respuesta: se muestra con lo que llegó a responder y el aviso. */
export interface IntercambioFallido {
  pregunta: string
  respuestaParcial: string
  aviso: Aviso
}

/** Cómo terminó `preguntar`: `devolver` pide poner la pregunta otra vez en el input para reescribirla. */
export type ResultadoDePreguntar = 'respondida' | 'fallida' | 'devolver' | 'ignorada'

interface AsistenteStore {
  /** El restaurante de la conversación cargada. */
  restauranteId: string | null
  /** Lo confirmado: cada pregunta que tuvo respuesta, con su respuesta. Es lo que se guarda y lo que se le manda. */
  mensajes: MensajeDelChatAsistente[]
  enCurso: IntercambioEnCurso | null
  fallido: IntercambioFallido | null
  /** Carga la conversación de este restaurante (si ya está cargada, no hace nada: puede haber una respuesta llegando). */
  abrir: (restauranteId: string) => void
  preguntar: (texto: string) => Promise<ResultadoDePreguntar>
  /** Vuelve a mandar la pregunta que falló, si su aviso lo ofrece. */
  reintentar: () => Promise<ResultadoDePreguntar>
}

/** Cuántas preguntas tuvieron respuesta en la conversación. */
export const preguntasHechas = (mensajes: MensajeDelChatAsistente[]) => mensajes.filter((m) => m.rol === 'usuario').length

const mismoRestaurante = (a: string | null, b: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/** Sin espacios en los costados, sin el carácter nulo (el backend lo rechaza) y con el tope de largo. */
const limpiar = (texto: string) => texto.split('\u0000').join('').trim().slice(0, MAX_CARACTERES_PREGUNTA)

// El pedido en curso: al pasar a otro restaurante se cancela, y lo que llegue tarde se descarta.
let pedidoEnCurso: AbortController | null = null
// Un token de mesa que el backend ya rechazó (`403 sesion_invalida`: venció): no se vuelve a mandar.
let tokenRechazado: string | null = null

/**
 * El token de la sesión de mesa viaja solo si la sesión es de este restaurante: en la carta de otro restaurante la
 * pregunta va sin sesión (con ese token el backend respondería 403).
 */
function tokenDeLaMesa(restauranteId: string): string | null {
  const { jwt, restauranteId: deLaSesion } = useSessionStore.getState()
  if (!jwt || jwt === tokenRechazado || !mismoRestaurante(deLaSesion, restauranteId)) return null
  return jwt
}

const sesionVencida = (resultado: ResultadoDelPedido) =>
  !resultado.ok && resultado.falla.tipo === 'rechazo' && resultado.falla.error?.codigo === 'sesion_invalida'

export const useAsistenteStore = create<AsistenteStore>()((set, get) => ({
  restauranteId: null,
  mensajes: [],
  enCurso: null,
  fallido: null,

  abrir: (restauranteId) => {
    if (mismoRestaurante(get().restauranteId, restauranteId)) return
    pedidoEnCurso?.abort()
    pedidoEnCurso = null
    set({ restauranteId, mensajes: leerConversacion(restauranteId), enCurso: null, fallido: null })
  },

  preguntar: async (texto) => {
    const { restauranteId, mensajes, enCurso } = get()
    const pregunta = limpiar(texto)
    if (!restauranteId || enCurso || !pregunta) return 'ignorada'
    if (preguntasHechas(mensajes) >= MAX_PREGUNTAS_POR_CONVERSACION) return 'ignorada'

    const pedido = new AbortController()
    pedidoEnCurso = pedido
    set({ enCurso: { pregunta, respuesta: '' }, fallido: null })

    const conLaPregunta: MensajeDelChatAsistente[] = [...mensajes, { rol: 'usuario', contenido: pregunta }]
    const peticion = { mensajes: conLaPregunta.slice(-MENSAJES_POR_PEDIDO) }
    const alRecibirTexto = (respuesta: string) => {
      if (pedidoEnCurso === pedido) set({ enCurso: { pregunta, respuesta } })
    }
    const pedir = (token: string | null) =>
      pedirRespuesta({ restauranteId, peticion, token, signal: pedido.signal, alRecibirTexto })

    const token = tokenDeLaMesa(restauranteId)
    let resultado = await pedir(token)
    // El token de la mesa venció (dura 12 horas): la pregunta va sin sesión, como desde la carta vista sin mesa.
    if (token && sesionVencida(resultado) && pedidoEnCurso === pedido) {
      tokenRechazado = token
      resultado = await pedir(null)
    }

    // Mientras tanto se pasó a otro restaurante: esta respuesta ya no es de la conversación que se ve.
    if (pedidoEnCurso !== pedido) return 'ignorada'
    pedidoEnCurso = null

    if (resultado.ok) {
      const confirmados: MensajeDelChatAsistente[] = [...conLaPregunta, { rol: 'asistente', contenido: resultado.texto }]
      set({ mensajes: confirmados, enCurso: null })
      guardarConversacion(restauranteId, confirmados)
      return 'respondida'
    }
    if (resultado.falla.tipo === 'cancelada') {
      set({ enCurso: null })
      return 'ignorada'
    }
    const aviso = avisoDeLaFalla(resultado.falla)
    set({ enCurso: null, fallido: { pregunta, respuestaParcial: resultado.textoParcial, aviso } })
    return aviso.devolverAlInput ? 'devolver' : 'fallida'
  },

  reintentar: async () => {
    const { fallido, preguntar } = get()
    if (!fallido?.aviso.reintentable) return 'ignorada'
    return preguntar(fallido.pregunta)
  },
}))
