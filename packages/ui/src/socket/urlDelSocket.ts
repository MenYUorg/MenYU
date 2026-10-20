/**
 * URL base del servidor de Socket.io: `VITE_WS_URL` si está, si no `VITE_API_URL` sin el `/api` final.
 *
 * Solo se saca el `/api` del final: con `https://api.menyu-app.com/api`, un `replace('/api', '')` sacaría el del
 * host y dejaría `https:/.menyu-app.com/api`.
 */
export function urlDelSocket(wsUrl: string | undefined, apiUrl: string | undefined): string | undefined {
  return wsUrl ?? apiUrl?.replace(/\/api\/?$/, '')
}
