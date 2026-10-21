import type { TokenPair, PerfilUsuario } from '../auth.types'
import type { OpenSessionResult } from '../session.types'

export type AuthResponse = TokenPair

export type OpenSessionResponse = OpenSessionResult

/** `GET /auth/me`, con el access token de Supabase. */
export type MeResponse = PerfilUsuario

/**
 * `POST /auth/invitaciones`. `invitacionEnviada` es false cuando el email ya tenía cuenta (en Supabase
 * o como `Usuario`): se le suma la membresía sin mandarle mail.
 */
export interface CrearInvitacionResponse {
  usuarioId: string
  membresiaId: string
  invitacionEnviada: boolean
}

/** Respuesta de subir o quitar el logo de una marca o de un restaurante (`logoUrl` es null al quitarlo). */
export interface LogoResponse {
  id: string
  logoUrl: string | null
}

export interface ApiError {
  statusCode: number
  message: string | string[]
  error?: string
}
