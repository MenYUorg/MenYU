import { create } from 'zustand'
import type { ItemCarritoUI } from '@menyu/types'

interface CartState {
  items: ItemCarritoUI[]
  agregar: (item: ItemCarritoUI) => void
  quitar: (index: number) => void
  incrementar: (index: number) => void
  decrementar: (index: number) => void
  limpiar: () => void
  total: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  agregar: (item) => set((state) => ({ items: [...state.items, item] })),

  quitar: (index) =>
    set((state) => ({ items: state.items.filter((_, i) => i !== index) })),

  incrementar: (index) =>
    set((state) => {
      const items = [...state.items]
      const item = items[index]
      if (!item) return state
      const precioUnitario = item.precioTotal / item.cantidad
      items[index] = { ...item, cantidad: item.cantidad + 1, precioTotal: precioUnitario * (item.cantidad + 1) }
      return { items }
    }),

  decrementar: (index) =>
    set((state) => {
      const items = [...state.items]
      const item = items[index]
      if (!item) return state
      if (item.cantidad === 1) return { items: items.filter((_, i) => i !== index) }
      const precioUnitario = item.precioTotal / item.cantidad
      items[index] = { ...item, cantidad: item.cantidad - 1, precioTotal: precioUnitario * (item.cantidad - 1) }
      return { items }
    }),

  limpiar: () => set({ items: [] }),

  total: () => get().items.reduce((acc, i) => acc + i.precioTotal, 0),
}))
