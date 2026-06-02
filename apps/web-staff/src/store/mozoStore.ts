import { create } from 'zustand'
import { TOKEN_KEY } from '@menyu/auth'
import type { Pedido } from '@menyu/types'

function nombresFromJwt(): { restauranteId: string | null; restauranteNombre: string | null; marcaNombre: string | null } {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return { restauranteId: null, restauranteNombre: null, marcaNombre: null }
    const payload = JSON.parse(atob(token.split('.')[1])) as { restauranteId?: string; restauranteNombre?: string; marcaNombre?: string }
    return {
      restauranteId:      payload.restauranteId      ?? null,
      restauranteNombre:  payload.restauranteNombre  ?? null,
      marcaNombre:        payload.marcaNombre         ?? null,
    }
  } catch {
    return { restauranteId: null, restauranteNombre: null, marcaNombre: null }
  }
}

export interface Llamado {
  llamadoId: string
  sesionId: string
  mesaNumero: string
  motivo: string
  recibitoEn: Date
  atendido: boolean
}

const API = import.meta.env.VITE_API_URL ?? ''

interface MozoStore {
  restauranteId: string | null
  restauranteNombre: string | null
  marcaNombre: string | null
  llamados: Llamado[]
  pedidosListos: Pedido[]
  setRestauranteId: (id: string) => void
  addLlamado: (data: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) => void
  marcarAtendido: (sesionId: string) => void
  agregarPedidoListo: (pedido: Pedido) => void
  marcarEntregado: (pedidoId: string, jwt: string) => Promise<void>
}

const _jwt = nombresFromJwt()

export const useMozoStore = create<MozoStore>()((set) => ({
  restauranteId:     _jwt.restauranteId,
  restauranteNombre: _jwt.restauranteNombre,
  marcaNombre:       _jwt.marcaNombre,
  llamados: [],
  pedidosListos: [],

  setRestauranteId: (id) => set({ restauranteId: id }),

  addLlamado: (data) =>
    set((s) => ({
      llamados: [
        ...s.llamados.filter((l) => l.sesionId !== data.sesionId),
        { llamadoId: data.llamadoId, sesionId: data.sesionId, mesaNumero: data.mesaNumero, motivo: data.motivo, recibitoEn: new Date(), atendido: false },
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
