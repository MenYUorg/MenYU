import { clienteAuth } from './cliente'

/**
 * El access token para `Authorization: Bearer` (docs/auth/specs/auth.md, API). Lee la cookie en cada llamada, así que
 * ve un logout hecho en otra app, y supabase-js lo renueva solo si está por vencer. Sin sesión, null.
 */
export async function tokenDeAcceso(): Promise<string | null> {
  const { data } = await clienteAuth().auth.getSession()
  return data.session?.access_token ?? null
}

/** Para el reintento después de un 401: pide un access token nuevo con el refresh token. Si no se pudo, null. */
export async function renovarSesion(): Promise<string | null> {
  const { data, error } = await clienteAuth().auth.refreshSession()
  if (error) return null
  return data.session?.access_token ?? null
}
