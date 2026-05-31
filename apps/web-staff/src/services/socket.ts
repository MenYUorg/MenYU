import { io, Socket } from 'socket.io-client'
import { TOKEN_KEY } from '@menyu/auth'
import type { Pedido } from '@menyu/types'

const WS_URL = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL?.replace('/api', '') ?? ''

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/ws`, {
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
  const s = getSocket()
  if (s.connected) {
    s.emit('mozo:join', { restauranteId })
  } else {
    s.once('connect', () => s.emit('mozo:join', { restauranteId }))
  }
}

export function joinRestauranteComoCocina(restauranteId: string) {
  const s = getSocket()
  if (s.connected) {
    s.emit('cocina:join', { restauranteId })
  } else {
    s.once('connect', () => s.emit('cocina:join', { restauranteId }))
  }
}

export function onMozoCalled(cb: (data: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) => void) {
  const s = getSocket()
  s.on('waiter:called', cb)
  return () => s.off('waiter:called', cb)
}

export function onPedidoNuevo(cb: (pedido: Pedido) => void) {
  const s = getSocket()
  s.on('order:new', cb)
  return () => s.off('order:new', cb)
}

export function onPedidoActualizado(cb: (pedido: Pedido) => void) {
  const s = getSocket()
  s.on('order:updated', cb)
  return () => s.off('order:updated', cb)
}

export function onPedidoEditado(cb: (pedido: Pedido) => void) {
  const s = getSocket()
  s.on('order:edited', cb)
  return () => s.off('order:edited', cb)
}
