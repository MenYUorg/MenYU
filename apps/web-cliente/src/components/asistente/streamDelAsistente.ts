import type { ErrorDelAsistente, PeticionAlAsistente } from '@menyu/types'
import { api } from '../../services/api'

// Una pregunta al asistente y su respuesta en streaming (docs/asistente/specs/asistente.md, Fases 4 y 6). El backend
// responde el UI message stream del AI SDK por SSE: un evento `data: <json>` por chunk y `data: [DONE]` al final. Se lee
// a mano (sin `@ai-sdk/react`): de los chunks solo importan el texto, el error y el final.

/** Lo que salió mal, para elegir qué mostrar (ver `avisos.ts`). */
export type FallaDelPedido =
  /** No hubo respuesta del servidor: sin conexión, o se cayó antes de contestar. */
  | { tipo: 'red' }
  /** Respondió un error antes del stream. `error` es su `{ codigo, mensaje }`, o null si el cuerpo no lo trae. */
  | { tipo: 'rechazo'; status: number; error: ErrorDelAsistente | null }
  /** La respuesta empezó y se cortó: el evento `error` del stream (con su `{ codigo, mensaje }`), o terminó sin `finish`. */
  | { tipo: 'cortada'; error: ErrorDelAsistente | null }
  /** Terminó bien pero sin texto (por ejemplo, el filtro de contenido del proveedor). */
  | { tipo: 'vacia' }
  /** Se canceló de este lado (se pasó a otro restaurante): no se muestra nada. */
  | { tipo: 'cancelada' }

export type ResultadoDelPedido =
  | { ok: true; texto: string }
  | { ok: false; falla: FallaDelPedido; textoParcial: string }

interface PedidoAlAsistente {
  restauranteId: string
  peticion: PeticionAlAsistente
  /** El token de la sesión de mesa, si hay una de este restaurante. */
  token: string | null
  signal: AbortSignal
  /** Se llama con el texto acumulado cada vez que llega un pedazo de la respuesta. */
  alRecibirTexto: (texto: string) => void
}

function esErrorDelAsistente(valor: unknown): valor is ErrorDelAsistente {
  if (typeof valor !== 'object' || valor === null) return false
  const { codigo, mensaje } = valor as Record<string, unknown>
  return typeof codigo === 'string' && typeof mensaje === 'string'
}

/** El `errorText` del evento de error es el JSON `{ codigo, mensaje }` que arma el backend. */
function errorDelEvento(errorText: unknown): ErrorDelAsistente | null {
  if (typeof errorText !== 'string') return null
  try {
    const valor: unknown = JSON.parse(errorText)
    return esErrorDelAsistente(valor) ? valor : null
  } catch {
    return null
  }
}

/** Los `data:` de un evento SSE, unidos (el protocolo permite partir uno en varias líneas). */
function datosDelEvento(evento: string): string | null {
  const lineas = evento.split('\n').filter((linea) => linea.startsWith('data:'))
  if (lineas.length === 0) return null
  return lineas.map((linea) => linea.slice(5).replace(/^ /, '')).join('\n')
}

/** Los fines de línea de SSE pueden ser `\r\n`: se pasan a `\n` para cortar los eventos en `\n\n`. */
const conSaltosSimples = (texto: string) => texto.replace(/\r\n/g, '\n')

type Chunk = { type?: unknown; delta?: unknown; errorText?: unknown; finishReason?: unknown }

async function leerElStream(res: Response, signal: AbortSignal, alRecibirTexto: (texto: string) => void): Promise<ResultadoDelPedido> {
  // En un objeto y no en variables sueltas: `procesar` lo cambia, y TypeScript no sigue lo que cambia otra función.
  const lectura: { texto: string; terminada: boolean; finishReason: unknown; falla: FallaDelPedido | null } = {
    texto: '',
    terminada: false,
    finishReason: undefined,
    falla: null,
  }

  // Un evento entero: suma texto o anota cómo terminó.
  const procesar = (evento: string) => {
    const datos = datosDelEvento(evento)
    if (datos === null || lectura.falla) return
    if (datos === '[DONE]') {
      lectura.terminada = true
      return
    }
    let chunk: Chunk
    try {
      chunk = JSON.parse(datos) as Chunk
    } catch {
      return
    }
    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
      if (chunk.delta === '') return
      lectura.texto += chunk.delta
      alRecibirTexto(lectura.texto)
    } else if (chunk.type === 'error') {
      lectura.falla = { tipo: 'cortada', error: errorDelEvento(chunk.errorText) }
    } else if (chunk.type === 'abort') {
      lectura.falla = { tipo: 'cortada', error: null }
    } else if (chunk.type === 'finish') {
      lectura.terminada = true
      lectura.finishReason = chunk.finishReason
    }
  }

  const lector = res.body?.getReader()
  try {
    if (!lector) {
      // Un navegador sin streams en fetch: llega todo junto al final, pero llega.
      conSaltosSimples(await res.text()).split('\n\n').forEach(procesar)
    } else {
      const decodificador = new TextDecoder()
      let pendiente = ''
      while (!lectura.falla) {
        const { done, value } = await lector.read()
        pendiente = conSaltosSimples(pendiente + (done ? decodificador.decode() : decodificador.decode(value, { stream: true })))
        let fin = pendiente.indexOf('\n\n')
        while (fin !== -1) {
          procesar(pendiente.slice(0, fin))
          pendiente = pendiente.slice(fin + 2)
          fin = pendiente.indexOf('\n\n')
        }
        if (done) {
          if (pendiente.trim()) procesar(pendiente)
          break
        }
      }
      // Después de un error no se sigue leyendo.
      if (lectura.falla) await lector.cancel().catch(() => undefined)
    }
  } catch {
    const falla: FallaDelPedido = signal.aborted ? { tipo: 'cancelada' } : { tipo: 'cortada', error: null }
    return { ok: false, falla, textoParcial: lectura.texto }
  }

  const { texto, terminada, finishReason, falla } = lectura
  if (falla) return { ok: false, falla, textoParcial: texto }
  if (!terminada || finishReason === 'error') return { ok: false, falla: { tipo: 'cortada', error: null }, textoParcial: texto }
  if (!texto.trim()) return { ok: false, falla: { tipo: 'vacia' }, textoParcial: '' }
  return { ok: true, texto }
}

/** Manda la pregunta (con la conversación) y lee la respuesta a medida que llega. Nunca tira: todo error es un resultado. */
export async function pedirRespuesta({ restauranteId, peticion, token, signal, alRecibirTexto }: PedidoAlAsistente): Promise<ResultadoDelPedido> {
  let res: Response
  try {
    res = await api.asistente.preguntar(restauranteId, peticion, token, signal)
  } catch {
    return { ok: false, falla: signal.aborted ? { tipo: 'cancelada' } : { tipo: 'red' }, textoParcial: '' }
  }
  if (!res.ok) {
    const cuerpo: unknown = await res.json().catch(() => null)
    return {
      ok: false,
      falla: { tipo: 'rechazo', status: res.status, error: esErrorDelAsistente(cuerpo) ? cuerpo : null },
      textoParcial: '',
    }
  }
  return leerElStream(res, signal, alRecibirTexto)
}
