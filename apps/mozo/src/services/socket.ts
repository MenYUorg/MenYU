import { io, Socket } from 'socket.io-client'

const WS_URL = 'https://menyuapi-production.up.railway.app'

let socket: Socket | null = null

export function getMozoSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/ws`, { transports: ['websocket'] })
  }
  return socket
}

export function joinRestauranteComoMozo(restauranteId: string) {
  getMozoSocket().emit('mozo:join', { restauranteId })
}

export function onMozoCalled(
  cb: (data: { sesionId: string; mesaNumero: string }) => void,
): () => void {
  const s = getMozoSocket()
  s.on('waiter:called', cb)
  return () => s.off('waiter:called', cb)
}

export function onPedidoActualizado(cb: (pedido: unknown) => void): () => void {
  const s = getMozoSocket()
  s.on('order:updated', cb)
  return () => s.off('order:updated', cb)
}

export function disconnectMozoSocket() {
  socket?.disconnect()
  socket = null
}
