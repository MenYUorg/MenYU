/** Texto para mostrarle al usuario cuando falla una llamada a la API (usa el mensaje del servidor si lo hay). */
export function mensajeDeError(err: unknown, porDefecto: string): string {
  return err instanceof Error && err.message ? err.message : porDefecto
}
