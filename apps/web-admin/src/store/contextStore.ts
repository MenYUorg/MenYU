import { create } from 'zustand'
import { api } from '../services/api'
import type { Marca, Restaurante } from '@menyu/types'

const RESTAURANTE_KEY = 'menyu-admin-restaurante-id'

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
  selectedRestauranteId: localStorage.getItem(RESTAURANTE_KEY),

  loadContext: async () => {
    try {
      const [marcas, restaurantes] = await Promise.all([
        api.marcas.list(),
        api.restaurantes.list(),
      ])
      const saved = localStorage.getItem(RESTAURANTE_KEY)
      const existe = saved && restaurantes.some((r) => r.id === saved)
      const selectedRestauranteId = existe ? saved : (restaurantes[0]?.id ?? null)
      set({
        marcas,
        restaurantes,
        selectedMarcaId: marcas[0]?.id ?? null,
        selectedRestauranteId,
      })
    } catch {
      // api.ts redirige a /login en caso de 401
    }
  },

  setMarca: (id) => set({ selectedMarcaId: id }),
  setRestaurante: (id) => {
    localStorage.setItem(RESTAURANTE_KEY, id)
    set({ selectedRestauranteId: id })
  },
}))
