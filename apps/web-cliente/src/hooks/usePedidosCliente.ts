import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { api } from '../services/api'
import { useSessionStore } from '../store/sessionStore'

export interface PedidoCliente {
  id: string
  sesionId: string
  estado: 'pendiente' | 'en_preparacion' | 'listo' | 'entregado'
  createdAt: string
  items: Array<{
    id: string
    cantidad: number
    item: { nombre: string }
  }>
}

const BASE    = (import.meta.env.VITE_API_URL as string) ?? ''
const WS_BASE = (import.meta.env.VITE_WS_URL as string) ?? BASE.replace('/api', '')

export function usePedidosCliente() {
  const jwt           = useSessionStore((s) => s.jwt)
  const sesionId      = useSessionStore((s) => s.sesionId)
  const restauranteId = useSessionStore((s) => s.restauranteId)

  const [pedidos, setPedidos] = useState<PedidoCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

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

    const socket = io(`${WS_BASE}/ws`, { transports: ['websocket'] })

    socket.on('connect', () => {
      socket.emit('session:join', { restauranteId })
    })

    socket.on('order:updated', (pedido: PedidoCliente) => {
      if (pedido.sesionId !== sesionId) return
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? pedido : p)))
    })

    return () => {
      socket.disconnect()
    }
  }, [jwt, sesionId, restauranteId])

  return { pedidos, loading, error }
}
