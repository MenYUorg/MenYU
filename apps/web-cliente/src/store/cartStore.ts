import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItemCarrito, ModificacionIngrediente } from '@menyu/types'

export interface ItemCarritoUI extends ItemCarrito {
  nombre: string
  imagenUrl: string | null
}

interface CartStore {
  items: ItemCarritoUI[]
  total: number
  addItem: (item: ItemCarritoUI) => void
  removeItem: (itemMenuId: string, modsKey: string) => void
  clearCart: () => void
}

const computeTotal = (items: ItemCarritoUI[]) =>
  items.reduce((sum, i) => sum + i.precioTotal * i.cantidad, 0)

export const buildModsKey = (mods: ModificacionIngrediente[]) =>
  [...mods]
    .sort((a, b) => a.itemIngredienteId.localeCompare(b.itemIngredienteId))
    .map((m) => `${m.itemIngredienteId}:${m.accion}:${m.cantidad}`)
    .join('|')

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      total: 0,

      addItem: (newItem) =>
        set((state) => {
          const newKey = buildModsKey(newItem.modificaciones)
          const idx = state.items.findIndex(
            (i) =>
              i.itemMenuId === newItem.itemMenuId &&
              buildModsKey(i.modificaciones) === newKey,
          )
          const newItems =
            idx >= 0
              ? state.items.map((item, i) =>
                  i === idx ? { ...item, cantidad: item.cantidad + 1 } : item,
                )
              : [...state.items, newItem]
          return { items: newItems, total: computeTotal(newItems) }
        }),

      removeItem: (itemMenuId, modsKey) =>
        set((state) => {
          const newItems = state.items.filter(
            (i) => !(i.itemMenuId === itemMenuId && buildModsKey(i.modificaciones) === modsKey),
          )
          return { items: newItems, total: computeTotal(newItems) }
        }),

      clearCart: () => set({ items: [], total: 0 }),
    }),
    { name: 'menyu_cart' },
  ),
)
