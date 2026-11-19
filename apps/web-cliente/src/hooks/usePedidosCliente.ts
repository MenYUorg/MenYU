import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { urlDelSocket } from '@menyu/ui/socket'
import { api } from '../services/api'
import { useSessionStore } from '../store/sessionStore'
import { anunciar } from '../utils/anunciador'
import { anuncioDelCambioDeEstado } from '../utils/estadoDelPedido'

export interface PedidoCliente {
  id: string
  sesionId: string
  estado: 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'anulado'
  createdAt: string
  items: Array<{
    id: string
    cantidad: number
    item: { nombre: string }
  }>
}

const BASE    = (import.meta.env.VITE_API_URL as string) ?? ''
const WS_BASE = urlDelSocket(import.meta.env.VITE_WS_URL as string | undefined, BASE) ?? ''

export function usePedidosCliente() {
  const jwt           = useSessionStore((s) => s.jwt)
  const sesionId      = useSessionStore((s) => s.sesionId)
  const restauranteId = useSessionStore((s) => s.restauranteId)

  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Lo último que se mostró, para saber si el pedido que llega por el socket cambió de estado (y no anunciar lo que ya se vio).
  const pedidosMostrados = useRef<PedidoCliente[]>([])
  useEffect(() => { pedidosMostrados.current = pedidos }, [pedidos])

  useEffect(() => {
    if (!jwt) {
      setLoading(false)
      setError('No hay sesión activa')
      return
    }

    setLoading(true)
    setError(null)

    api.orders
      .list(jwt)
      .then((data) => {
        setPedidos(data as PedidoCliente[])
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Error al cargar pedidos')
        setLoading(false)
      })

    if (!restauranteId) return

    // El JWT de la mesa viaja en el handshake (`auth`) y el gateway lo verifica al unirse a la sala.
    const socket = io(`${WS_BASE}/ws`, { transports: ['websocket'], auth: { token: jwt } })

    socket.on('connect', () => {
      socket.emit('session:join', { restauranteId })
    })

    socket.on('order:updated', (pedido: PedidoCliente) => {
      if (pedido.sesionId !== sesionId) return
      // El pedido se actualiza solo, sin que nadie toque nada: si cambió de estado, se dice en voz alta.
      const anterior = pedidosMostrados.current.find((p) => p.id === pedido.id)
      if (anterior && anterior.estado !== pedido.estado) {
        anunciar(anuncioDelCambioDeEstado(pedido.items, pedido.estado))
      }
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? pedido : p)))
    })

    return () => {
      socket.disconnect()
    }
  }, [jwt, sesionId, restauranteId])

  return { pedidos, loading, error }
}
