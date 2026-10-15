import { useEffect, useState } from 'react'
import { api } from '../services/api'
import * as socketCliente from '../services/socket'
import { useSessionStore } from '../store/sessionStore'

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

    return socketCliente.onPedidoActualizado<PedidoCliente>((pedido) => {
      if (pedido.sesionId !== sesionId) return
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? pedido : p)))
    })
  }, [jwt, sesionId, restauranteId])

  return { pedidos, loading, error }
}
