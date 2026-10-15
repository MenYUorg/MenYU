import { io, type Socket } from 'socket.io-client'
import { TOKEN_KEY, reconectarSiRechazaElServidor } from '@menyu/auth'
import { useTiempoRealStore } from '../store/tiempoRealStore'

const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ??
  ''

/**
 * Conecta el socket de un restaurante y se une a su room de admin (el servidor valida el acceso).
 * El join se repite en cada (re)conexión: al reconectar el servidor entrega un socket nuevo, sin las
 * rooms del anterior.
 */
export function conectarComoAdmin(restauranteId: string): Socket {
  const socket = io(`${WS_URL}/ws`, {
    // Función: se evalúa en cada intento de conexión, también en las reconexiones.
    auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) }),
    transports: ['websocket'],
  })
  socket.on('connect', () => {
    useTiempoRealStore.getState().restablecer()
    socket.emit('admin:join', { restauranteId })
  })
  reconectarSiRechazaElServidor(socket, () => useTiempoRealStore.getState().marcarSinTiempoReal())
  return socket
}

export function cerrarConexionAdmin(socket: Socket) {
  socket.disconnect()
  useTiempoRealStore.getState().restablecer()
}
