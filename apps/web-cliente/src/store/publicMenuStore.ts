import { create } from 'zustand'
import { api } from '../services/api'
import { useCarritoStore } from './carritoStore'
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
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const menu = await api.menu.publico(restauranteId)
      set({ menu })
      // El carrito se guarda en el navegador: con el menú nuevo se corrigen los precios que cambiaron.
      useCarritoStore.getState().repreciar(menu)
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
      const found = cat.itemsDirectos.find((item) => item.id === id)
      if (found) return found
    }
    // Un plato sin categoría solo aparece en recomendados o en descuentos.
    return (
      (menu.recomendados ?? []).find((item) => item.id === id) ??
      (menu.descuentos ?? []).find((item) => item.id === id)
    )
  },

  clear: () => set({ menu: null, error: null }),
}))
