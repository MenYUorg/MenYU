import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { useSessionStore } from '../store/sessionStore'
import { useComensalStore } from '../store/comensalStore'

interface PedidoSesion {
  id: string
  items: Array<{
    id: string
    cantidad: number
    precioUnitario: number
    item: { nombre: string }
  }>
}

export interface Comensal {
  id: string
  sesionId: string
  clienteId: string | null
  nombre: string
  esOwner: boolean
  creadoPorComensalId: string | null
  createdAt: string
}

export interface ItemEtiquetado {
  pedidoItemId: string
  nombre: string
  cantidad: number
  precioUnitario: number
  etiquetas: Comensal[]
}

export function useEtiquetado(sesionId: string) {
  const [items, setItems] = useState<ItemEtiquetado[]>([])
  const [comensales, setComensales] = useState<Comensal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // sesionId falsy: el caller lo está usando en modo inerte a propósito
    // (por ejemplo, una pantalla que solo necesita el hook en una de sus ramas),
    // no un error — no hay nada que pedirle al backend.
    if (!sesionId) {
      setLoading(false)
      setError(null)
      return
    }

    const jwt = useSessionStore.getState().jwt
    if (!jwt) {
      setLoading(false)
      setError('No hay sesión activa')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [pedidosRaw, comensalesData] = await Promise.all([
        api.orders.list(jwt),
        api.comensales.listar(sesionId),
      ])
      const pedidos = pedidosRaw as PedidoSesion[]
      const pedidoItems = pedidos.flatMap((p) => p.items)

      const etiquetasPorItem = await Promise.all(
        pedidoItems.map((pi) => api.comensales.listarEtiquetasDeItem(sesionId, pi.id)),
      )

      const itemsCombinados: ItemEtiquetado[] = pedidoItems.map((pi, idx) => ({
        pedidoItemId: pi.id,
        nombre: pi.item.nombre,
        cantidad: pi.cantidad,
        precioUnitario: pi.precioUnitario,
        etiquetas: etiquetasPorItem[idx].map((e) => e.comensal),
      }))

      setItems(itemsCombinados)
      setComensales(comensalesData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el etiquetado')
    } finally {
      setLoading(false)
    }
  }, [sesionId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const etiquetar = useCallback(
    async (pedidoItemId: string, comensalId: string) => {
      await api.comensales.etiquetar(sesionId, pedidoItemId, comensalId)
      await refetch()
    },
    [sesionId, refetch],
  )

  const desetiquetar = useCallback(
    async (pedidoItemId: string, comensalId: string) => {
      await api.comensales.desetiquetar(sesionId, pedidoItemId, comensalId)
      await refetch()
    },
    [sesionId, refetch],
  )

  const agregarComensal = useCallback(
    async (nombre: string) => {
      const comensalIdActual = useComensalStore.getState().comensalId
      await api.comensales.crear(sesionId, nombre, false, comensalIdActual ?? undefined)
      await refetch()
    },
    [sesionId, refetch],
  )

  const borrarComensal = useCallback(
    async (comensalId: string) => {
      const comensalIdActual = useComensalStore.getState().comensalId
      if (!comensalIdActual) throw new Error('No se encontró el comensal actual')
      await api.comensales.borrarComensal(sesionId, comensalId, comensalIdActual)
      await refetch()
    },
    [sesionId, refetch],
  )

  return { items, comensales, loading, error, refetch, etiquetar, desetiquetar, agregarComensal, borrarComensal }
}
