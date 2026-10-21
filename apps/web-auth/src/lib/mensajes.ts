import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'

// Los errores de Supabase Auth, en palabras del usuario. Los códigos: @supabase/auth-js, lib/error-codes.

/** El canje de la vuelta de Google falló o no se pudo hacer (por ejemplo, se empezó en otro navegador). */
export const GOOGLE_SIN_TERMINAR = 'No pudimos terminar el ingreso con Google. Probá de nuevo desde este navegador.'

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'El email o la contraseña no son correctos.',
  email_not_confirmed: 'Todavía no confirmaste tu email. Abrí el link que te mandamos por mail.',
  user_banned: 'Tu cuenta está suspendida. Hablá con el administrador de tu restaurante.',
  over_request_rate_limit: 'Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.',
  over_email_send_rate_limit: 'Ya te mandamos varios mails. Esperá unos minutos antes de pedir otro.',
  otp_expired: 'El link venció o ya se usó.',
  weak_password: 'Esa contraseña es muy fácil de adivinar. Probá con una más larga o que mezcle letras y números.',
  same_password: 'La contraseña nueva tiene que ser distinta de la anterior.',
  flow_state_not_found: GOOGLE_SIN_TERMINAR,
  flow_state_expired: GOOGLE_SIN_TERMINAR,
  bad_code_verifier: GOOGLE_SIN_TERMINAR,
  bad_oauth_state: GOOGLE_SIN_TERMINAR,
  bad_oauth_callback: GOOGLE_SIN_TERMINAR,
}

export const SIN_CONEXION = 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.'
export const ERROR_GENERICO = 'Algo salió mal. Probá de nuevo en unos minutos.'

export function mensajeDeError(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return SIN_CONEXION
  if (isAuthError(error) && error.code && POR_CODIGO[error.code]) return POR_CODIGO[error.code]
  if (error instanceof TypeError) return SIN_CONEXION // fetch sin red
  return ERROR_GENERICO
}

/**
 * El error que Supabase deja en la URL de vuelta de Google (`error`, `error_code`, `error_description`), o null.
 * `access_denied` es que la persona canceló en la pantalla de Google.
 */
export function errorDeOAuth(search: string): string | null {
  const params = new URLSearchParams(search)
  const error = params.get('error')
  const codigo = params.get('error_code')
  if (!error && !codigo && !params.has('error_description')) return null
  if (error === 'access_denied') return 'Cancelaste el ingreso con Google.'
  return (codigo && POR_CODIGO[codigo]) || GOOGLE_SIN_TERMINAR
}
