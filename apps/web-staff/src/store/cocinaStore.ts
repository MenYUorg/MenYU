import { create } from 'zustand'
import type { Pedido, EstadoPedido } from '@menyu/types'

interface CocinaStore {
  pedidos: Pedido[]
  agregarPedido: (pedido: Pedido) => void
  actualizarEstado: (pedidoId: string, estado: EstadoPedido) => void
}

export const useCocinaStore = create<CocinaStore>()((set) => ({
  pedidos: [],
  agregarPedido: (pedido) =>
    set((s) => ({
      pedidos: [pedido, ...s.pedidos],
    })),
  actualizarEstado: (pedidoId, estado) =>
    set((s) => ({
      pedidos: s.pedidos.map((p) =>
        p.id === pedidoId ? { ...p, estado } : p,
      ),
    })),
}))
