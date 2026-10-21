import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { credencialesDeSupabase, dominioDeLaCookie } from './config'

let cliente: SupabaseClient | null = null

/**
 * Opciones de la cookie de sesión. Con el dominio compartido la ven todas las apps de MenYU (SSO). `secure` solo con
 * https: en `*.menyu.local` se trabaja con http y el navegador descartaría la cookie. La setea el navegador, así que no
 * es httpOnly (decisión consciente para el MVP: docs/auth/specs/auth.md, Notas de seguridad).
 */
export function opcionesDeCookie(protocolo: string = window.location.protocol) {
  return { domain: dominioDeLaCookie(), path: '/', sameSite: 'lax' as const, secure: protocolo === 'https:' }
}

/**
 * El cliente de Supabase Auth de todas las apps. @supabase/ssr guarda la sesión en la cookie (no en localStorage) y
 * fuerza el flujo PKCE. Los links de invitación y de recuperación traen un `token_hash` que se canjea con `verifyOtp`,
 * así que no dependen del flujo (plantillas de mail: docs/auth/VariablesACambiar.md).
 */
export function clienteAuth(): SupabaseClient {
  if (!cliente) {
    const { url, clave } = credencialesDeSupabase()
    // El singleton es este: el de @supabase/ssr se apaga para que haya una sola regla.
    cliente = createBrowserClient(url, clave, { cookieOptions: opcionesDeCookie(), isSingleton: false })
  }
  return cliente
}
