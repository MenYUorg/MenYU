import type { TokenPair, JwtPayload } from '../auth.types'
import type { OpenSessionResult } from '../session.types'

export type AuthResponse = TokenPair

export type OpenSessionResponse = OpenSessionResult

export type MeResponse = JwtPayload

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
