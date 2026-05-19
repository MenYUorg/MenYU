import { create } from 'zustand'
import type { ItemCarrito } from '@menyu/types'

interface CarritoState {
  items: ItemCarrito[]
  agregarItem: (item: Omit<ItemCarrito, 'cantidad'>) => void
  quitarItem: (itemId: string) => void
  actualizarCantidad: (itemId: string, cantidad: number) => void
  vaciarCarrito: () => void
  total: () => number
  cantidadTotal: () => number
}

export const useCarritoStore = create<CarritoState>((set, get) => ({
  items: [],

  agregarItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.id === item.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i,
          ),
        }
      }
      return { items: [...state.items, { ...item, cantidad: 1 }] }
    }),

  quitarItem: (itemId) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== itemId) })),

  actualizarCantidad: (itemId, cantidad) =>
    set((state) => {
      if (cantidad <= 0) {
        return { items: state.items.filter((i) => i.id !== itemId) }
      }
      return {
        items: state.items.map((i) => (i.id === itemId ? { ...i, cantidad } : i)),
      }
    }),

  vaciarCarrito: () => set({ items: [] }),

  total: () => get().items.reduce((acc, i) => acc + i.precio * i.cantidad, 0),

  cantidadTotal: () => get().items.reduce((acc, i) => acc + i.cantidad, 0),
}))
