import { create } from 'zustand'
import { api } from '../services/api'
import type { Marca, Restaurante } from '@menyu/types'

interface ContextStore {
  marcas: Marca[]
  restaurantes: Restaurante[]
  selectedMarcaId: string | null
  selectedRestauranteId: string | null
  loadContext: () => Promise<void>
  setMarca: (id: string) => void
  setRestaurante: (id: string) => void
}

export const useContextStore = create<ContextStore>()((set) => ({
  marcas: [],
  restaurantes: [],
  selectedMarcaId: null,
  selectedRestauranteId: null,

  loadContext: async () => {
    try {
      const [marcas, restaurantes] = await Promise.all([
        api.marcas.list(),
        api.restaurantes.list(),
      ])
      set({
        marcas,
        restaurantes,
        selectedMarcaId: marcas[0]?.id ?? null,
        selectedRestauranteId: restaurantes[0]?.id ?? null,
      })
    } catch {
      // api.ts redirige a /login en caso de 401
    }
  },

  setMarca: (id) => set({ selectedMarcaId: id }),
  setRestaurante: (id) => set({ selectedRestauranteId: id }),
}))
