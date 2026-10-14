/**
 * Contenido (payload) de un JWT, o `null` si el token no tiene la forma esperada.
 * El payload es JSON en UTF-8 codificado en base64url: `atob` solo devuelve bytes, así que hay que decodificar el texto
 * aparte; si no, los acentos y la Ñ salen rotos ("González" se ve "GonzÃ¡lez").
 */
export function decodificarPayloadJwt(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const binario = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const texto = new TextDecoder().decode(Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0)))
    const datos: unknown = JSON.parse(texto)
    return typeof datos === 'object' && datos !== null ? (datos as Record<string, unknown>) : null
  } catch {
    return null
  }
}
