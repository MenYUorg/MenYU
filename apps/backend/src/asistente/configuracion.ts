// Las variables de entorno del endpoint del asistente (docs/asistente/specs/asistente.md, "Límites de uso"). Se leen en
// cada pedido, como el resto del backend; las de los límites de uso las suma la Fase 5.

/** El modelo de la Fase 0 de la spec. Se cambia con ASISTENTE_MODELO, sin tocar código. */
export const MODELO_POR_DEFECTO = 'gemini-3.1-flash-lite'

export interface ConfiguracionDelAsistente {
  modelo: string
  /** Largo máximo de la pregunta (el último mensaje del usuario). */
  maxCaracteresPregunta: number
  /** El backend se queda con los últimos N mensajes del historial: trunca, no rechaza. */
  maxMensajesHistorial: number
  /** `maxOutputTokens` de cada respuesta. */
  maxTokensRespuesta: number
}

/** Un entero mayor que cero de la env; si falta o no lo es, el valor por defecto. */
function enteroPositivo(nombre: string, porDefecto: number): number {
  const valor = Number(process.env[nombre])
  return Number.isInteger(valor) && valor > 0 ? valor : porDefecto
}

export function configuracionDelAsistente(): ConfiguracionDelAsistente {
  return {
    modelo: process.env.ASISTENTE_MODELO?.trim() || MODELO_POR_DEFECTO,
    maxCaracteresPregunta: enteroPositivo('ASISTENTE_MAX_CARACTERES_PREGUNTA', 500),
    maxMensajesHistorial: enteroPositivo('ASISTENTE_MAX_MENSAJES_HISTORIAL', 10),
    maxTokensRespuesta: enteroPositivo('ASISTENTE_MAX_TOKENS_RESPUESTA', 500),
  }
}
