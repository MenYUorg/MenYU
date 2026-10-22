import { io, Socket } from 'socket.io-client'
import { logout } from '@menyu/auth-client'
import type { Pedido } from '@menyu/types'
import { urlDelSocket } from '@menyu/ui/socket'

const WS_URL = urlDelSocket(import.meta.env.VITE_WS_URL, import.meta.env.VITE_API_URL) ?? ''

type EventoDeSala = 'mozo:join' | 'cocina:join'

let socket: Socket | null = null
/** El restaurante al que se unió esta conexión. El gateway no saca a nadie de una sala, así que hay que recordarlo. */
let restauranteDeLaSala: string | null = null
/** Con qué eventos se entró: al reconectar hay que volver a entrar con todos (mozo y cocina pueden estar los dos). */
const eventosDeLaSala = new Set<EventoDeSala>()

function getSocket(): Socket {
  if (!socket) {
    // El gateway no autentica la conexión (docs/auth/specs/auth.md, Fuera de alcance): no se le manda ningún token.
    const nuevo = io(`${WS_URL}/ws`, { transports: ['websocket'] })
    // Socket.io reconecta solo (una caída de red, un reinicio del backend), y el socket nuevo del servidor no está en
    // ninguna sala: sin volver a entrar acá, el tiempo real se moriría en silencio hasta navegar a otra pantalla.
    nuevo.on('connect', () => {
      if (!restauranteDeLaSala) return
      for (const evento of eventosDeLaSala) nuevo.emit(evento, { restauranteId: restauranteDeLaSala })
    })
    socket = nuevo
  }
  return socket
}

export function disconnect() {
  socket?.disconnect()
  socket = null
  restauranteDeLaSala = null
  eventosDeLaSala.clear()
}

/**
 * Entra a la sala del restaurante. El gateway hace `join` y nunca `leave` (`menyu.gateway.ts`), así que al cambiar de
 * restaurante se reconecta: si no, seguirían llegando los pedidos y llamados de la sucursal anterior.
 */
function unirse(evento: EventoDeSala, restauranteId: string) {
  if (restauranteDeLaSala && restauranteDeLaSala !== restauranteId) disconnect()
  restauranteDeLaSala = restauranteId
  eventosDeLaSala.add(evento)
  const s = getSocket()
  // Si todavía no conectó, la entrada la hace el oyente de `connect` de `getSocket`.
  if (s.connected) s.emit(evento, { restauranteId })
}

/**
 * Cerrar sesión desde web-staff: antes de irse a web-auth corta el socket, que si no queda escuchando los eventos del
 * restaurante hasta que el browser descarga la página.
 */
export async function cerrarSesion(): Promise<void> {
  disconnect()
  await logout()
}

export function joinRestauranteComoMozo(restauranteId: string) {
  unirse('mozo:join', restauranteId)
}

export function joinRestauranteComoCocina(restauranteId: string) {
  unirse('cocina:join', restauranteId)
}

/*
 * Los oyentes se enganchan a la conexión viva, y cambiar de restaurante la reemplaza. Por eso cada pantalla llama
 * primero a `joinRestaurante*` y después a los `on*`, en el mismo efecto y con `restauranteId` en sus dependencias:
 * así, al cambiar de sala, se vuelve a enganchar a la conexión nueva en lugar de quedar escuchando una descartada.
 */

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
