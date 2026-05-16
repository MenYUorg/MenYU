import { create } from 'zustand'
import type { MenuPublico, MenuPublicoItem } from '@menyu/types'

const API_URL = 'https://menyuapi-production.up.railway.app/api'

interface MenuState {
  menu: MenuPublico | null
  loading: boolean
  error: string | null
  fetchMenu: (restauranteId: string) => Promise<void>
  getItemById: (itemId: string) => MenuPublicoItem | null
  clear: () => void
}

export const useMenuStore = create<MenuState>((set, get) => ({
  menu: null,
  loading: false,
  error: null,

  fetchMenu: async (restauranteId) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${API_URL}/menu/${restauranteId}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data: MenuPublico = await res.json()
      set({ menu: data })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Error al cargar el menú' })
    } finally {
      set({ loading: false })
    }
  },

  getItemById: (itemId) => {
    const menu = get().menu
    if (!menu) return null
    for (const cat of menu.categorias) {
      for (const sub of cat.subcategorias) {
        const item = sub.items.find((i) => i.id === itemId)
        if (item) return item
      }
    }
    return null
  },

  clear: () => set({ menu: null, error: null }),
}))
