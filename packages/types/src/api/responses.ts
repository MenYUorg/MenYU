import type { TokenPair, JwtPayload } from '../auth.types'
import type { OpenSessionResult } from '../session.types'

export type AuthResponse = TokenPair

export type OpenSessionResponse = OpenSessionResult

export type MeResponse = JwtPayload

export interface ApiError {
  statusCode: number
  message: string | string[]
  error?: string
}
