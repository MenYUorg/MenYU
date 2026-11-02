/** Texto para mostrarle al usuario cuando falla una llamada a la API (usa el mensaje del servidor si lo hay). */
export function mensajeDeError(err: unknown, porDefecto: string): string {
  return err instanceof Error && err.message ? err.message : porDefecto
}

/**
 * Como `mensajeDeError`, pero solo usa el mensaje de la API cuando le sirve a quien lo lee: un 4xx con texto ("No
 * tenés permiso para esta acción"). Un 5xx ("Internal server error"), un 400 de validación sin texto ("Error 400") o
 * un error de red muestran `porDefecto`. Mira el `status` del `ApiError` sin importarlo, para no depender del cliente.
 */
export function mensajeDeLaApi(err: unknown, porDefecto: string): string {
  const status = (err as { status?: unknown } | null | undefined)?.status
  if (typeof status !== 'number' || status >= 500) return porDefecto
  const mensaje = mensajeDeError(err, '')
  return mensaje && !/^Error \d{3}$/.test(mensaje) ? mensaje : porDefecto
}
