import type { Session } from '@supabase/supabase-js'
import { cargarAuthClient } from './authClientDiferido'
import { urlDeAuth } from './urlDeAuth'

// La cuenta opcional del cliente (docs/auth/specs/auth.md, Fase 4b): se abre en web-auth y vive en la cookie de dominio
// compartido. No es obligatoria: sin cuenta, el QR y el PIN entran como invitado. Esta app no monta RequireAuth, porque
// su sesión de mesa no es una cuenta. La Fase 5 retiró el login propio de `/auth`, que convivía con esta.

/** Claves del token del login de `/auth`, que ya no existe. Se borran una vez para no dejar basura en el navegador. */
const CLAVES_DEL_LOGIN_ANTERIOR = ['menyu_access_token', 'menyu_refresh_token']

export function olvidarElLoginAnterior(): void {
  try {
    for (const clave of CLAVES_DEL_LOGIN_ANTERIOR) localStorage.removeItem(clave)
  } catch {
    // Sin localStorage (modo privado, cookies bloqueadas) no hay nada que limpiar.
  }
}

export interface Cuenta {
  nombre: string
  email: string
}

/**
 * El nombre para el saludo, tal cual viene (por ejemplo, "Marina González"), con los espacios emprolijados. No se adivina
 * dónde termina el nombre y empieza el apellido.
 */
export function nombreParaSaludo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  return valor.trim().replace(/\s+/g, ' ') || null
}

/** La cuenta de una sesión de Supabase: el nombre que eligió al registrarse en web-auth, el de Google o, si no, el email. */
export function cuentaDeSesion(session: Session): Cuenta {
  const metadatos: Record<string, unknown> = session.user.user_metadata ?? {}
  const email = session.user.email ?? ''
  const nombre =
    nombreParaSaludo(metadatos['nombre']) ??
    nombreParaSaludo(metadatos['full_name']) ??
    nombreParaSaludo(metadatos['name']) ??
    (email || 'Cliente')
  return { nombre, email }
}

/**
 * El token que va en `POST /sessions/open` para que la mesa quede a nombre de la cuenta. Sin cuenta, undefined: entra
 * como invitado.
 *
 * Sin cookie de sesión no carga supabase-js: abrir la mesa por QR o PIN es lo primero que hace quien se sienta, y no
 * tiene que esperar un chunk que no le sirve.
 */
export async function tokenParaAbrirMesa(): Promise<string | undefined> {
  if (!puedeHaberSesion()) return undefined
  try {
    const { tokenDeAcceso } = await cargarAuthClient()
    return (await tokenDeAcceso()) ?? undefined
  } catch {
    // Un deploy sin las variables de Supabase, o una cookie ilegible: no hay cuenta.
    return undefined
  }
}

/**
 * Cierra la cuenta y la persona se queda en esta app (a diferencia de `logout()` del paquete, que va a web-auth).
 * Se cierra en todas las apps de MenYU: la cookie es de dominio compartido.
 */
export async function cerrarSesionDeLaCuenta(): Promise<void> {
  try {
    const { clienteAuth } = await cargarAuthClient()
    await clienteAuth().auth.signOut({ scope: 'local' })
  } catch {
    // supabase-js borra la sesión local aunque falle la llamada, y sin las variables de Supabase no había sesión.
  }
}

/** web-auth, para iniciar sesión o crear una cuenta, con la vuelta a esta pantalla (web-auth valida el `redirect`). */
export function urlDeIngreso(accion: AccionDeIngreso, volverA: string = window.location.href): string {
  const url = new URL(accion === 'crear' ? '/crear-cuenta' : '/', `${urlDeAuth()}/`)
  url.searchParams.set('redirect', volverA)
  return url.toString()
}

export type AccionDeIngreso = 'ingresar' | 'crear'

/**
 * Si esta app ve la sesión de web-auth: tiene las variables de Supabase y su host está bajo el dominio de la cookie
 * (`VITE_AUTH_COOKIE_DOMAIN`). En los dominios viejos de Vercel (`menyu-cliente*.vercel.app`) no: el navegador rechaza
 * esa cookie, así que ahí la cuenta no es posible y el QR y el PIN entran como invitado.
 */
export function comparteLaSesionDeWebAuth(hostname: string = window.location.hostname): boolean {
  const env = import.meta.env
  const dominio = env.VITE_AUTH_COOKIE_DOMAIN?.replace(/^\./, '')
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY || !dominio) return false
  return hostname === dominio || hostname.endsWith(`.${dominio}`)
}

/**
 * Si el navegador tiene la cookie de sesión de Supabase. Sirve para no cargar supabase-js cuando no hay nada que leer,
 * que es el caso de casi todo el que abre Discovery: sin cuenta, la pantalla no espera ningún chunk.
 *
 * `@supabase/ssr` la guarda como `sb-<ref>-auth-token`, y si es grande la parte en `…auth-token.0`, `.1`… El patrón es
 * a propósito ancho: de más solo cuesta cargar el paquete y preguntarle (que es lo correcto); de menos se perdería una
 * sesión de verdad. La cookie no es httpOnly (la setea el navegador), así que se puede leer desde acá.
 */
export function hayCookieDeSesion(cookies: string = document.cookie): boolean {
  return /(?:^|;\s*)sb-[^=;]*auth-token/.test(cookies)
}

/**
 * Si vale la pena cargar supabase-js: esta app comparte la sesión de web-auth y hay una cookie que leer. Lo usan los
 * dos lugares que lo cargan (`tokenParaAbrirMesa` y `useSesionDiferida`), para que no puedan diferir.
 */
export function puedeHaberSesion(): boolean {
  return comparteLaSesionDeWebAuth() && hayCookieDeSesion()
}
