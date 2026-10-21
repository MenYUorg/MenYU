// El parámetro `redirect` solo puede llevar a una app de MenYU: si no, web-auth sería un open redirect
// (docs/auth/specs/auth.md, Notas de seguridad). Las URLs relativas no se aceptan: siempre es otra app.

const DOMINIO_PROPIO = '.menyu-app.com' // también cubre *.staging.menyu-app.com
const DOMINIO_LOCAL = '.menyu.local'

/** Devuelve la URL normalizada si es de MenYU, o null. */
export function redirectValido(valor: string | null | undefined): string | null {
  if (!valor) return null

  let url: URL
  try {
    url = new URL(valor)
  } catch {
    return null
  }

  if (url.username || url.password) return null

  const propio = url.hostname.endsWith(DOMINIO_PROPIO)
  const local = url.hostname.endsWith(DOMINIO_LOCAL)
  if (propio && url.protocol === 'https:') return url.toString()
  if (local && (url.protocol === 'https:' || url.protocol === 'http:')) return url.toString()
  return null
}
