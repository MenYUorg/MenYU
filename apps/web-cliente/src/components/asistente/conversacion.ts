import type { MensajeDelChatAsistente } from '@menyu/types'

// El historial del chat del asistente (docs/asistente/specs/asistente.md, Fase 6): una conversación por restaurante, en
// sessionStorage, así sobrevive un refresh y se va con la pestaña. Se guarda solo lo confirmado (cada pregunta con su
// respuesta): una pregunta que falló no se guarda ni se le vuelve a mandar al asistente.

/** El prefijo de las claves: `menyu_asistente:<restauranteId>`. */
const PREFIJO = 'menyu_asistente:'

/** El restaurante cuya carta está abierta: solo se guarda su conversación. */
let restauranteActivo: string | null = null

// Los ids son UUID: no importan las mayúsculas (como `menuEsDe` del store del menú).
const normalizar = (restauranteId: string) => restauranteId.toLowerCase()
const claveDe = (restauranteId: string) => `${PREFIJO}${normalizar(restauranteId)}`

function esMensaje(valor: unknown): valor is MensajeDelChatAsistente {
  if (typeof valor !== 'object' || valor === null) return false
  const { rol, contenido } = valor as Record<string, unknown>
  return (rol === 'usuario' || rol === 'asistente') && typeof contenido === 'string'
}

/**
 * Se entró a la carta de este restaurante: las conversaciones de los demás se borran. Así, al pasar a otro restaurante
 * (y también al volver al anterior) la conversación arranca de cero: no se arrastra nada de un restaurante a otro.
 */
export function entrarAlRestaurante(restauranteId: string): void {
  restauranteActivo = normalizar(restauranteId)
  try {
    const propia = claveDe(restauranteId)
    const otras: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const clave = sessionStorage.key(i)
      if (clave?.startsWith(PREFIJO) && clave !== propia) otras.push(clave)
    }
    otras.forEach((clave) => sessionStorage.removeItem(clave))
  } catch {
    // Sin sessionStorage (bloqueado por el navegador) la conversación vive solo mientras la pestaña está abierta.
  }
}

/** La conversación guardada de este restaurante; vacía si no hay, o si lo guardado no tiene la forma esperada. */
export function leerConversacion(restauranteId: string): MensajeDelChatAsistente[] {
  try {
    const crudo = sessionStorage.getItem(claveDe(restauranteId))
    if (!crudo) return []
    const datos: unknown = JSON.parse(crudo)
    return Array.isArray(datos) && datos.every(esMensaje) ? datos : []
  } catch {
    return []
  }
}

/** Guarda la conversación, salvo que ya se haya pasado a la carta de otro restaurante (una respuesta que llegó tarde). */
export function guardarConversacion(restauranteId: string, mensajes: MensajeDelChatAsistente[]): void {
  if (restauranteActivo !== normalizar(restauranteId)) return
  try {
    sessionStorage.setItem(claveDe(restauranteId), JSON.stringify(mensajes))
  } catch {
    // Lleno o bloqueado: la conversación sigue en memoria.
  }
}
