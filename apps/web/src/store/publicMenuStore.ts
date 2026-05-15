import { create } from 'zustand'
import { api } from '../services/api'
import type { MenuPublico, MenuPublicoItem } from '@menyu/types'

interface PublicMenuStore {
  menu: MenuPublico | null
  loading: boolean
  error: string | null
  fetchMenu: (restauranteId: string) => Promise<void>
  getItemById: (id: string) => MenuPublicoItem | undefined
  clear: () => void
}

export const usePublicMenuStore = create<PublicMenuStore>()((set, get) => ({
  menu: null,
  loading: false,
  error: null,

  fetchMenu: async (restauranteId) => {
    set({ loading: true, error: null })
    try {
      const menu = await api.menu.publico(restauranteId)
      set({ menu })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error al cargar el menú' })
    } finally {
      set({ loading: false })
    }
  },

  getItemById: (id) => {
    const menu = get().menu
    if (!menu) return undefined
    for (const cat of menu.categorias) {
      const direct = cat.itemsDirectos.find((item) => item.id === id)
      if (direct) return direct
      for (const sub of cat.subcategorias) {
        const found = sub.items.find((item) => item.id === id)
        if (found) return found
      }
    }
    return undefined
  },

  clear: () => set({ menu: null, error: null }),
}))
