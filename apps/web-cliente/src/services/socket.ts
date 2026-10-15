import { io, type Socket } from 'socket.io-client'
import { useSessionStore } from '../store/sessionStore'
import { useTiempoRealStore } from '../store/tiempoRealStore'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const WS_BASE = (import.meta.env.VITE_WS_URL as string | undefined) ?? BASE.replace('/api', '')

interface Conexion {
  socket: Socket
  jwt: string
  suscriptores: number
}

let conexion: Conexion | null = null

function cerrar() {
  conexion?.socket.disconnect()
  conexion = null
  useTiempoRealStore.getState().restablecer()
}

/**
 * El servidor une al comensal a sus rooms (sesion-<id> y el menú del restaurante) al conectar, según
 * el JWT de sesión: si la sesión cambia hay que reconectar con el token nuevo.
 */
function obtenerConexion(): Conexion | null {
  const jwt = useSessionStore.getState().jwt
  if (!jwt) return null
  if (conexion && conexion.jwt !== jwt) cerrar()
  if (!conexion) {
    const socket = io(`${WS_BASE}/ws`, {
      // Función: se evalúa en cada intento de conexión, también en las reconexiones.
      auth: (cb) => cb({ token: useSessionStore.getState().jwt }),
      transports: ['websocket'],
    })
    socket.on('connect', () => useTiempoRealStore.getState().restablecer())
    // El token de sesión no se puede renovar, así que un rechazo del servidor no se reintenta: se
    // avisa y nada más. Si la sesión venció, lo descubre el REST.
    socket.on('disconnect', (motivo: string) => {
      if (motivo === 'io server disconnect') useTiempoRealStore.getState().marcarSinTiempoReal()
    })
    conexion = { socket, jwt, suscriptores: 0 }
  }
  return conexion
}

function suscribir<T>(evento: string, cb: (datos: T) => void): () => void {
  const actual = obtenerConexion()
  if (!actual) return () => {}
  const listener = cb as (...args: unknown[]) => void
  actual.socket.on(evento, listener)
  actual.suscriptores++
  return () => {
    actual.socket.off(evento, listener)
    actual.suscriptores--
    if (actual.suscriptores === 0 && conexion === actual) cerrar()
  }
}

export const onSesionCerrada = (cb: (d: { sesionId: string }) => void) => suscribir('sesion:cerrada', cb)
export const onSesionCobrada = (cb: (d: { sesionId: string }) => void) => suscribir('sesion:cobrada', cb)
export const onMenuActualizado = (cb: (d: { restauranteId: string }) => void) => suscribir('menu:updated', cb)
export const onPedidoActualizado = <T extends { sesionId: string }>(cb: (pedido: T) => void) =>
  suscribir('order:updated', cb)
