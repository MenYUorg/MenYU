import { create } from 'zustand'
import type { Pedido } from '@menyu/types'

export interface Llamado {
  sesionId: string
  mesaNumero: string
  recibitoEn: Date
  atendido: boolean
}

const API = import.meta.env.VITE_API_URL ?? ''

interface MozoStore {
  restauranteId: string | null
  llamados: Llamado[]
  pedidosListos: Pedido[]
  setRestauranteId: (id: string) => void
  addLlamado: (data: { sesionId: string; mesaNumero: string }) => void
  marcarAtendido: (sesionId: string) => void
  agregarPedidoListo: (pedido: Pedido) => void
  marcarEntregado: (pedidoId: string, jwt: string) => Promise<void>
}

export const useMozoStore = create<MozoStore>()((set) => ({
  restauranteId: null,
  llamados: [],
  pedidosListos: [],

  setRestauranteId: (id) => set({ restauranteId: id }),

  addLlamado: (data) =>
    set((s) => ({
      llamados: [
        ...s.llamados.filter((l) => l.sesionId !== data.sesionId),
        { ...data, recibitoEn: new Date(), atendido: false },
      ],
    })),

  marcarAtendido: (sesionId) =>
    set((s) => ({
      llamados: s.llamados.map((l) =>
        l.sesionId === sesionId ? { ...l, atendido: true } : l,
      ),
    })),

  agregarPedidoListo: (pedido) =>
    set((s) => ({
      pedidosListos: [
        ...s.pedidosListos.filter((p) => p.id !== pedido.id),
        pedido,
      ],
    })),

  marcarEntregado: async (pedidoId, jwt) => {
    const res = await fetch(`${API}/pedidos/${pedidoId}/estado`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ estado: 'entregado' }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
      throw new Error(typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`)
    }
    set((s) => ({
      pedidosListos: s.pedidosListos.filter((p) => p.id !== pedidoId),
    }))
  },
}))
