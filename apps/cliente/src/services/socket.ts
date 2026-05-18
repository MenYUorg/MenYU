import { io, Socket } from 'socket.io-client'

const WS_URL = 'https://menyuapi-production.up.railway.app'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/ws`, { transports: ['websocket'] })
  }
  return socket
}

export function joinRestaurante(restauranteId: string) {
  getSocket().emit('session:join', { restauranteId })
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
