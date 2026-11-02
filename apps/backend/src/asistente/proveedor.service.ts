import { Inject, Injectable, Logger } from '@nestjs/common'
import { APICallError, RetryError, streamText, type ModelMessage, type UIMessageChunk } from 'ai'
import { configuracionDelAsistente } from './configuracion'
import { cuerpoDeError, type ErrorDelAsistente } from './errores'
import { MODELO_DEL_ASISTENTE, VARIABLE_DE_LA_KEY, type ModeloDelAsistente } from './modelo'
import type { ResultadoDelIntento } from './registro-asistente.service'

// La llamada al modelo con el AI SDK (docs/asistente/specs/asistente.md, "Endpoint del asistente y streaming"). No sabe
// de dónde sale el contexto (ContextoService) ni de qué proveedor es el modelo (modelo.ts).

/** Respuestas cortas y fieles a los datos. */
const TEMPERATURA = 0.3
/** Tope de toda la respuesta: con un modelo chico y 500 tokens de salida tarda unos pocos segundos. */
const TIMEOUT_MS = 30_000
/** Lo que se loguea de un error, como mucho. */
const MAX_LOG = 300

export interface MensajeDelChat {
  rol: 'usuario' | 'asistente'
  contenido: string
}

/** El stream listo para mandar, o el error del proveedor antes del primer texto. */
export type ArranqueDelStream =
  | { ok: true; stream: ReadableStream<UIMessageChunk> }
  | { ok: false; error: ErrorDelAsistente }

/** Un 429 del proveedor: se le terminó el cupo por minuto o por día. */
function esCuotaAgotada(error: unknown): boolean {
  const causa = RetryError.isInstance(error) ? error.lastError : error
  return APICallError.isInstance(causa) && causa.statusCode === 429
}

/** Una línea para el log: el tipo de error, el status del proveedor y el mensaje, sin la key y recortado. */
function describirError(error: unknown): string {
  const status = APICallError.isInstance(error) && error.statusCode ? ` ${error.statusCode}` : ''
  const texto = error instanceof Error ? `${error.name}${status}: ${error.message}` : String(error)
  const key = process.env[VARIABLE_DE_LA_KEY]
  // Primero se saca la key y después se recorta: al revés, un recorte en el medio de la key dejaría un pedazo.
  return (key ? texto.split(key).join('[key]') : texto).slice(0, MAX_LOG)
}

function aMensajeDelModelo(mensaje: MensajeDelChat): ModelMessage {
  return mensaje.rol === 'usuario'
    ? { role: 'user', content: mensaje.contenido }
    : { role: 'assistant', content: mensaje.contenido }
}

/** El `errorText` de un chunk de error es el `{ codigo, mensaje }` que arma `onError` en `toUIMessageStream`. */
function leerError(errorText: string): ErrorDelAsistente {
  try {
    return JSON.parse(errorText) as ErrorDelAsistente
  } catch {
    return cuerpoDeError('error_del_asistente')
  }
}

/**
 * Los metadatos del proveedor no son para el cliente: Gemini 3, por ejemplo, manda en el último chunk de texto una
 * `thoughtSignature` (una firma opaca de su razonamiento) aunque no haya tokens de razonamiento.
 */
function sinMetadatosDelProveedor(chunk: UIMessageChunk): UIMessageChunk {
  if (!('providerMetadata' in chunk)) return chunk
  const { providerMetadata: _metadatos, ...resto } = chunk
  return resto as UIMessageChunk
}

/**
 * `pipeUIMessageStreamToResponse` escribe el status 200 antes de leer el primer chunk. Para que una falla del proveedor
 * antes de empezar a responder (un 429, sobre todo) salga con su status y `{ codigo, mensaje }`, como los demás errores
 * previos al stream, se lee hasta el primer texto y recién ahí se arma el stream de la respuesta, con lo leído adelante.
 */
async function esperarElPrimerTexto(stream: ReadableStream<UIMessageChunk>): Promise<ArranqueDelStream> {
  const lector = stream.getReader()
  const leidos: UIMessageChunk[] = []
  try {
    while (true) {
      const { done, value } = await lector.read()
      if (done) break
      if (value.type === 'error') {
        await lector.cancel().catch(() => undefined)
        return { ok: false, error: leerError(value.errorText) }
      }
      leidos.push(value)
      if (value.type === 'text-delta' || value.type === 'finish') break
    }
  } catch {
    return { ok: false, error: cuerpoDeError('error_del_asistente') }
  }
  return {
    ok: true,
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of leidos) controller.enqueue(sinMetadatosDelProveedor(chunk))
      },
      async pull(controller) {
        const { done, value } = await lector.read()
        if (done) controller.close()
        else controller.enqueue(sinMetadatosDelProveedor(value))
      },
      cancel(motivo) {
        return lector.cancel(motivo)
      },
    }),
  }
}

@Injectable()
export class ProveedorService {
  private readonly logger = new Logger(ProveedorService.name)

  constructor(@Inject(MODELO_DEL_ASISTENTE) private readonly modelo: ModeloDelAsistente) {}

  /** El que se guarda en `RegistroAsistente.modelo`. */
  get nombreDelModelo(): string {
    return this.modelo.modelId
  }

  /**
   * Manda el system prompt y la conversación al modelo. `alTerminar` recibe la respuesta completa, los tokens y la
   * duración cuando el stream termina bien; si falla, no se llama.
   */
  async responder(
    system: string,
    mensajes: MensajeDelChat[],
    alTerminar: (resultado: ResultadoDelIntento) => Promise<void>,
  ): Promise<ArranqueDelStream> {
    const inicio = Date.now()
    const resultado = streamText({
      model: this.modelo,
      system,
      messages: mensajes.map(aMensajeDelModelo),
      maxOutputTokens: configuracionDelAsistente().maxTokensRespuesta,
      temperature: TEMPERATURA,
      // Cada reintento es otra llamada al proveedor, y ante un 429 de cupo no sirve: la persona reintenta desde el chat.
      maxRetries: 0,
      timeout: TIMEOUT_MS,
      // El de por defecto hace console.error con el error entero, que trae el cuerpo del pedido (el prompt).
      onError: ({ error }) => {
        this.logger.warn(`El modelo no respondió: ${describirError(error)}`)
      },
      onFinish: async ({ text, totalUsage, finishReason }) => {
        // Con un error a mitad de la respuesta el SDK igual llama a onFinish, con el texto cortado: la fila queda con la
        // respuesta en null, como cuando falla antes de empezar.
        if (finishReason === 'error') return
        const razonamiento = totalUsage.outputTokenDetails.reasoningTokens
        if (razonamiento) {
          this.logger.warn(`El modelo usó ${razonamiento} tokens de razonamiento: cuentan como salida y consumen maxOutputTokens`)
        }
        try {
          await alTerminar({
            respuesta: text,
            tokensEntrada: totalUsage.inputTokens ?? null,
            tokensSalida: totalUsage.outputTokens ?? null,
            duracionMs: Date.now() - inicio,
          })
        } catch (error) {
          this.logger.error(`No se pudo completar el registro del asistente: ${describirError(error)}`)
        }
      },
    })
    const stream = resultado.toUIMessageStream({
      // El razonamiento del modelo, si lo hubiera, no es para el cliente.
      sendReasoning: false,
      // Lo que ve el cliente de un error: `{ codigo, mensaje }`, nunca el detalle del proveedor.
      onError: (error) =>
        JSON.stringify(cuerpoDeError(esCuotaAgotada(error) ? 'no_disponible_momentaneamente' : 'error_del_asistente')),
    })
    return esperarElPrimerTexto(stream)
  }
}
