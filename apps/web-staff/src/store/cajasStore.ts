import { useEffect } from 'react'
import { create } from 'zustand'
import type { CajaAbierta } from '@menyu/types'
import { api } from '../services/api'

interface CajasStore {
  /** El restaurante de `cajas`. */
  restauranteId: string | null
  /** Las cajas abiertas del turno (#359). `null`: todavía no se sabe o no se pudo leer. `[]`: no hay un turno abierto. */
  cajas: CajaAbierta[] | null
  /** Pide las cajas abiertas del restaurante. Si llega una respuesta de un pedido anterior, se ignora. */
  cargar: (restauranteId: string) => Promise<void>
}

// El último pedido de `cargar`: la respuesta de uno anterior (otro restaurante, o un polling que se cruzó) no pisa la
// del más nuevo.
let ultimoPedido = 0

/**
 * Las cajas abiertas del turno del restaurante elegido, compartidas por las pantallas del mozo. Un error (de red, 403 o
 * 404, por ejemplo con un backend sin GET /cajas/abiertas) deja `null`: no bloquea el cobro, decide la API.
 */
export const useCajasStore = create<CajasStore>()((set, get) => ({
  restauranteId: null,
  cajas: null,

  cargar: async (restauranteId) => {
    const pedido = ++ultimoPedido
    if (get().restauranteId !== restauranteId) set({ restauranteId, cajas: null })
    try {
      const { cajas } = await api.cajas.abiertas(restauranteId)
      if (pedido === ultimoPedido) set({ cajas })
    } catch {
      if (pedido === ultimoPedido) set({ cajas: null })
    }
  },
}))

/** Las cajas abiertas del restaurante: las pide al montar y cuando cambia el restaurante. Las de otro restaurante no. */
export function useCajasAbiertas(restauranteId: string | null): CajaAbierta[] | null {
  const cajas = useCajasStore((s) => (restauranteId !== null && s.restauranteId === restauranteId ? s.cajas : null))
  const cargar = useCajasStore((s) => s.cargar)

  useEffect(() => {
    if (restauranteId) void cargar(restauranteId)
  }, [restauranteId, cargar])

  return cajas
}
