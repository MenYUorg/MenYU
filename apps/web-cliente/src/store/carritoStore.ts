import { create } from 'zustand'

export interface CartMod {
  itemIngredienteId: string
  accion: 'AGREGAR' | 'QUITAR'
  cantidad: number
}

export interface CartItem {
  cartId: string        // id único dentro del carrito (no el itemId del menú)
  itemId: string
  nombre: string
  precioUnitario: number
  cantidad: number
  notas?: string
  mods: CartMod[]
}

interface CarritoStore {
  items: CartItem[]
  agregar: (item: Omit<CartItem, 'cartId'>) => void
  quitarUno: (cartId: string) => void
  vaciar: () => void
  total: () => number
}

export const useCarritoStore = create<CarritoStore>()((set, get) => ({
  items: [],

  agregar: (item) =>
    set((s) => ({
      items: [...s.items, { ...item, cartId: crypto.randomUUID() }],
    })),

  quitarUno: (cartId) =>
    set((s) => ({ items: s.items.filter((i) => i.cartId !== cartId) })),

  vaciar: () => set({ items: [] }),

  total: () => get().items.reduce((acc, i) => acc + i.precioUnitario * i.cantidad, 0),
}))
