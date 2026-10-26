import type { PerfilUsuario, Rol } from '../auth.types'
import type { OpenSessionResult } from '../session.types'

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

/** Una persona con acceso a un restaurante (una membresía). */
export interface MiembroDelPersonal {
  membresiaId: string
  usuarioId: string
  nombre: string
  email: string
  rol: Rol
}

/**
 * `GET /restaurantes/:restauranteId/personal`. `duenos` son los OWNER de la marca (cubren todas sus sucursales y no
 * se quitan desde acá). `sinCuenta`, los mozos del login propio que todavía no tienen cuenta: se los invita con su email.
 */
export interface PersonalDelRestaurante {
  duenos: MiembroDelPersonal[]
  miembros: MiembroDelPersonal[]
  sinCuenta: { mozoId: string; nombre: string; email: string | null; esJefeSalon: boolean }[]
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
