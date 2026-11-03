import { google } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import { configuracionDelAsistente } from './configuracion'

/** El modelo como objeto (no como id de texto): de ahí sale el nombre que guarda el registro. */
export type ModeloDelAsistente = Exclude<LanguageModel, string>

/** Token de inyección del modelo. Los tests lo reemplazan por un `MockLanguageModelV3` de `ai/test`. */
export const MODELO_DEL_ASISTENTE = Symbol('MODELO_DEL_ASISTENTE')

/** La variable de la key que lee el provider. ProveedorService la saca de lo que loguea. */
export const VARIABLE_DE_LA_KEY = 'GOOGLE_GENERATIVE_AI_API_KEY'

/**
 * El único archivo que conoce al proveedor (decisión 7 de la definición). Cambiar de modelo es cambiar `ASISTENTE_MODELO`;
 * cambiar de proveedor, este import (con su paquete) y `VARIABLE_DE_LA_KEY`. `@ai-sdk/google` lee la key en cada pedido,
 * no al crear el modelo: el backend arranca aunque falte, y el asistente responde 502.
 */
export function crearModeloDelAsistente(): ModeloDelAsistente {
  return google(configuracionDelAsistente().modelo)
}
