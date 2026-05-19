import { io, Socket } from 'socket.io-client'
import { TOKEN_KEY } from '@menyu/auth'

const WS_URL = import.meta.env.VITE_API_URL ?? ''

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      auth: { token: localStorage.getItem(TOKEN_KEY) },
      transports: ['websocket'],
    })
  }
  return socket
}

export function disconnect() {
  socket?.disconnect()
  socket = null
}

export function joinRestauranteComoMozo(restauranteId: string) {
  getSocket().emit('mozo:join', { restauranteId })
}

export function onMozoCalled(cb: (data: { sesionId: string; mesaNumero: string }) => void) {
  const s = getSocket()
  s.on('waiter:called', cb)
  return () => s.off('waiter:called', cb)
}

export function onPedidoNuevo(cb: () => void) {
  const s = getSocket()
  s.on('order:new', cb)
  return () => s.off('order:new', cb)
}
