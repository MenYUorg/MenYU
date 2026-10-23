import { clienteAuth, tokenDeAcceso } from '@menyu/auth-client'
import type { Session } from '@supabase/supabase-js'
import { decodificarPayloadJwt } from './jwt'
import { borrarTokensDeCuenta, leerTokenDeCuenta } from './tokenCuenta'
import { urlDeAuth } from './urlDeAuth'

// La cuenta opcional del cliente (docs/auth/specs/auth.md, Fase 4b). Hasta la Fase 5 conviven dos: la de Supabase, que
// se abre en web-auth y vive en la cookie de dominio compartido, y la del login de `/auth` de esta app (su token en
// localStorage). Si hay las dos, vale la de Supabase. Ninguna es obligatoria: sin cuenta, el QR y el PIN entran como
// invitado. Esta app no monta RequireAuth: su sesión de mesa no es una cuenta.

export interface Cuenta {
  nombre: string
  email: string
  origen: 'supabase' | 'anterior'
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
  return { nombre, email, origen: 'supabase' }
}

/** La del login de `/auth`: un token de cliente, sin vencer y con nombre. Si no, null. */
export function cuentaDelLoginAnterior(): Cuenta | null {
  const token = leerTokenDeCuenta()
  if (!token) return null
  const payload = decodificarPayloadJwt(token)
  const nombre = nombreParaSaludo(payload?.['nombre'])
  if (!nombre) return null
  const email = payload?.['email']
  return { nombre, email: typeof email === 'string' ? email : '', origen: 'anterior' }
}

/**
 * El token que va en `POST /sessions/open` para que la mesa quede a nombre de la cuenta: el de Supabase si hay sesión (el
 * backend reconoce cada uno por cómo está firmado) y, si no, el del login anterior. Sin cuenta, undefined: entra como
 * invitado.
 */
export async function tokenParaAbrirMesa(): Promise<string | undefined> {
  try {
    const token = await tokenDeAcceso()
    if (token) return token
  } catch {
    // Un deploy sin las variables de Supabase, o una cookie ilegible: no hay cuenta de Supabase.
  }
  return leerTokenDeCuenta()
}

/**
 * Cierra las dos cuentas y la persona se queda en esta app (a diferencia de `logout()` del paquete, que va a web-auth).
 * La de Supabase se cierra en todas las apps de MenYU: la cookie es de dominio compartido.
 */
export async function cerrarSesionDeLaCuenta(): Promise<void> {
  borrarTokensDeCuenta()
  try {
    await clienteAuth().auth.signOut({ scope: 'local' })
  } catch {
    // supabase-js borra la sesión local aunque falle la llamada, y sin las variables de Supabase no había sesión.
  }
}

/** web-auth, para iniciar sesión o crear una cuenta, con la vuelta a esta pantalla (web-auth valida el `redirect`). */
export function urlDeIngreso(accion: 'ingresar' | 'crear', volverA: string = window.location.href): string {
  const url = new URL(accion === 'crear' ? '/crear-cuenta' : '/', `${urlDeAuth()}/`)
  url.searchParams.set('redirect', volverA)
  return url.toString()
}
