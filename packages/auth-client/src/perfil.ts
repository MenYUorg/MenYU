import type { MeResponse, PerfilUsuario } from '@menyu/types'
import { urlDeLaApi } from './config'

export type ResultadoPerfil =
  | { tipo: 'ok'; perfil: PerfilUsuario }
  | { tipo: 'sin-acceso' } // 403: la cuenta de Supabase no tiene Usuario, o está inactivo
  | { tipo: 'sesion-invalida' } // 401: token vencido, alterado o de otro proyecto
  | { tipo: 'error' } // sin red, 5xx, o 503 si el backend no llega al JWKS

/** GET /auth/me con el access token de Supabase (docs/auth/specs/auth.md, Fase 2). */
export async function obtenerPerfil(token: string): Promise<ResultadoPerfil> {
  let res: Response
  try {
    res = await fetch(`${urlDeLaApi()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    return { tipo: 'error' }
  }
  if (res.status === 401) return { tipo: 'sesion-invalida' }
  if (res.status === 403) return { tipo: 'sin-acceso' }
  if (!res.ok) return { tipo: 'error' }
  return { tipo: 'ok', perfil: (await res.json()) as MeResponse }
}
