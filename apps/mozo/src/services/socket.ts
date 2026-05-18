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
  getMozoSocket().emit('session:join', { restauranteId })
}

export function onMozoCalled(
  cb: (data: { sesionId: string; mesaNumero: string }) => void,
): () => void {
  const s = getMozoSocket()
  s.on('mozo:llamado', cb)
  return () => s.off('mozo:llamado', cb)
}

export function onPedidoNuevo(cb: (pedido: unknown) => void): () => void {
  const s = getMozoSocket()
  s.on('pedido:nuevo', cb)
  return () => s.off('pedido:nuevo', cb)
}

export function onPedidoEstado(cb: (pedido: unknown) => void): () => void {
  const s = getMozoSocket()
  s.on('pedido:estado', cb)
  return () => s.off('pedido:estado', cb)
}

export function disconnectMozoSocket() {
  socket?.disconnect()
  socket = null
}
