import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'

// Los errores de Supabase Auth, en palabras del usuario. Los códigos: @supabase/auth-js, lib/error-codes.

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'El email o la contraseña no son correctos.',
  email_not_confirmed: 'Todavía no confirmaste tu email. Abrí el link que te mandamos por mail.',
  user_banned: 'Tu cuenta está suspendida. Hablá con el administrador de tu restaurante.',
  over_request_rate_limit: 'Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.',
  over_email_send_rate_limit: 'Ya te mandamos varios mails. Esperá unos minutos antes de pedir otro.',
  otp_expired: 'El link venció o ya se usó.',
  weak_password: 'Esa contraseña es muy fácil de adivinar. Probá con una más larga o que mezcle letras y números.',
  same_password: 'La contraseña nueva tiene que ser distinta de la anterior.',
}

export const SIN_CONEXION = 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.'
export const ERROR_GENERICO = 'Algo salió mal. Probá de nuevo en unos minutos.'

export function mensajeDeError(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return SIN_CONEXION
  if (isAuthError(error) && error.code && POR_CODIGO[error.code]) return POR_CODIGO[error.code]
  if (error instanceof TypeError) return SIN_CONEXION // fetch sin red
  return ERROR_GENERICO
}
