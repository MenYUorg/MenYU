// El parámetro `redirect` solo puede llevar a una app de MenYU: si no, web-auth sería un open redirect
// (docs/auth/specs/auth.md, Notas de seguridad). Las URLs relativas no se aceptan: siempre es otra app.

const DOMINIO_PROPIO = '.menyu-app.com' // también cubre *.staging.menyu-app.com
const DOMINIO_LOCAL = '.menyu.local'

function esLocal(hostname: string): boolean {
  return hostname.endsWith(DOMINIO_LOCAL) || hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * Devuelve la URL normalizada si es de MenYU, o null. `*.menyu.local` solo vale cuando web-auth también corre en local
 * (`hostname` es el de web-auth): en staging y en producción no hay por qué mandar a una máquina de desarrollo.
 */
export function redirectValido(
  valor: string | null | undefined,
  hostname: string = window.location.hostname,
): string | null {
  if (!valor) return null

  let url: URL
  try {
    url = new URL(valor)
  } catch {
    return null
  }

  if (url.username || url.password) return null

  if (url.hostname.endsWith(DOMINIO_PROPIO) && url.protocol === 'https:') return url.toString()
  if (url.hostname.endsWith(DOMINIO_LOCAL) && esLocal(hostname) && ['https:', 'http:'].includes(url.protocol)) {
    return url.toString()
  }
  return null
}
