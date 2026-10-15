import { io, Socket } from 'socket.io-client'
import { TOKEN_KEY, reconectarSiRechazaElServidor } from '@menyu/auth'
import type { Pedido } from '@menyu/types'
import { useTiempoRealStore } from '../store/tiempoRealStore'

const WS_URL = import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL?.replace('/api', '') ?? ''

let socket: Socket | null = null

// Joins explícitos que hay que repetir en cada (re)conexión: al reconectar el servidor
// entrega un socket nuevo, sin las rooms del anterior. La room del mozo la asigna el
// servidor al conectar y no necesita join.
const cocinas = new Set<string>()
const adminRestaurantes = new Set<string>()

function tipoDeToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return null
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return (JSON.parse(atob(payload)) as { tipo?: string }).tipo ?? null
  } catch {
    return null
  }
}

function unirRooms(s: Socket) {
  for (const restauranteId of cocinas) s.emit('cocina:join', { restauranteId })
  if (tipoDeToken() === 'admin') {
    for (const restauranteId of adminRestaurantes) s.emit('admin:join', { restauranteId })
  }
}

function getSocket(): Socket {
  if (!socket) {
    const s = io(`${WS_URL}/ws`, {
      // Función: se evalúa en cada intento de conexión, también en las reconexiones.
      auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) }),
      transports: ['websocket'],
    })
    s.on('connect', () => {
      useTiempoRealStore.getState().restablecer()
      unirRooms(s)
    })
    reconectarSiRechazaElServidor(s, () => useTiempoRealStore.getState().marcarSinTiempoReal())
    socket = s
  }
  return socket
}

export function disconnect() {
  socket?.disconnect()
  socket = null
  cocinas.clear()
  adminRestaurantes.clear()
  useTiempoRealStore.getState().restablecer()
}

/**
 * Un mozo ya está en su room desde que conecta (la asigna el servidor). Un admin que entra
 * al panel del mozo se une a la room admin del restaurante.
 */
export function joinRestauranteComoMozo(restauranteId: string) {
  adminRestaurantes.add(restauranteId)
  const s = getSocket()
  if (s.connected && tipoDeToken() === 'admin') s.emit('admin:join', { restauranteId })
}

export function joinRestauranteComoCocina(restauranteId: string) {
  cocinas.add(restauranteId)
  const s = getSocket()
  if (s.connected) s.emit('cocina:join', { restauranteId })
}

export function onMozoCalled(cb: (data: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) => void) {
  const s = getSocket()
  s.on('waiter:called', cb)
  return () => s.off('waiter:called', cb)
}

export function onSesionCerrada(cb: (data: { sesionId: string }) => void) {
  const s = getSocket()
  s.on('sesion:cerrada', cb)
  return () => s.off('sesion:cerrada', cb)
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

export function onSesionQuierePagar(cb: (data: { sesionId: string; mesaId: string; mesaNumero: string; totalAcumulado: number }) => void) {
  const s = getSocket()
  s.on('sesion:quierePagar', cb)
  return () => s.off('sesion:quierePagar', cb)
}

export function onSesionCobrada(cb: (data: { sesionId: string; mesaId: string; mesaNumero: string }) => void) {
  const s = getSocket()
  s.on('sesion:cobrada', cb)
  return () => s.off('sesion:cobrada', cb)
}
