import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartMod {
  itemIngredienteId: string
  accion: 'agregar' | 'quitar'
  cantidad: number
  nombre?: string
}

export interface CartItem {
  cartId: string
  itemMenuId: string
  nombre: string
  precioUnitario: number
  cantidad: number
  nota?: string
  modificaciones: CartMod[]
}

interface CarritoStore {
  items: CartItem[]
  agregar: (item: Omit<CartItem, 'cartId'>) => void
  quitar: (cartId: string) => void
  cambiarCantidad: (cartId: string, cantidad: number) => void
  vaciar: () => void
  total: () => number
}

export const useCarritoStore = create<CarritoStore>()(
  persist(
    (set, get) => ({
      items: [],

      agregar: (item) =>
        set((s) => ({
          items: [...s.items, { ...item, cartId: crypto.randomUUID() }],
        })),

      quitar: (cartId) =>
        set((s) => ({ items: s.items.filter((i) => i.cartId !== cartId) })),

      cambiarCantidad: (cartId, cantidad) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.cartId === cartId ? { ...i, cantidad } : i))
            .filter((i) => i.cantidad > 0),
        })),

      vaciar: () => set({ items: [] }),

      total: () => get().items.reduce((acc, i) => acc + i.precioUnitario * i.cantidad, 0),
    }),
    { name: 'menyu_carrito' },
  ),
)
