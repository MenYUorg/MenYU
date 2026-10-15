import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MenuPublico } from '@menyu/types'
import { repreciarItems } from '../utils/repreciarCarrito'

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
  imagenUrl?: string | null
}

interface CarritoStore {
  items: CartItem[]
  /** true si al abrir el menú cambió el precio de algún plato del carrito (se avisa en el carrito). No se guarda. */
  avisoPrecios: boolean
  agregar: (item: Omit<CartItem, 'cartId'>) => void
  quitar: (cartId: string) => void
  cambiarCantidad: (cartId: string, cantidad: number) => void
  reemplazar: (cartId: string, item: Omit<CartItem, 'cartId'>) => void
  vaciar: () => void
  /** Actualiza los precios del carrito con el menú actual (descuentos nuevos o ya sacados). */
  repreciar: (menu: MenuPublico) => void
  descartarAvisoPrecios: () => void
  total: () => number
}

export const useCarritoStore = create<CarritoStore>()(
  persist(
    (set, get) => ({
      items: [],
      avisoPrecios: false,

      agregar: (item) =>
        set((s) => {
          const modsKey = (mods: CartMod[]) =>
            [...mods]
              .sort((a, b) => a.itemIngredienteId.localeCompare(b.itemIngredienteId))
              .map((m) => `${m.itemIngredienteId}:${m.accion}:${m.cantidad}`)
              .join('|')

          const existente = s.items.find(
            (i) =>
              i.itemMenuId === item.itemMenuId &&
              i.nota === item.nota &&
              modsKey(i.modificaciones) === modsKey(item.modificaciones),
          )

          if (existente) {
            return {
              items: s.items.map((i) =>
                i.cartId === existente.cartId
                  ? { ...i, cantidad: i.cantidad + item.cantidad, precioUnitario: item.precioUnitario }
                  : i,
              ),
            }
          }

          return {
            items: [...s.items, { ...item, cartId: crypto.randomUUID() }],
          }
        }),

      quitar: (cartId) =>
        set((s) => {
          const items = s.items.filter((i) => i.cartId !== cartId)
          return { items, avisoPrecios: items.length > 0 && s.avisoPrecios }
        }),

      cambiarCantidad: (cartId, cantidad) =>
        set((s) => {
          const items = s.items
            .map((i) => (i.cartId === cartId ? { ...i, cantidad } : i))
            .filter((i) => i.cantidad > 0)
          return { items, avisoPrecios: items.length > 0 && s.avisoPrecios }
        }),

      reemplazar: (cartId, item) =>
        set((s) => ({
          items: s.items.map((i) => (i.cartId === cartId ? { ...item, cartId } : i)),
        })),

      vaciar: () => set({ items: [], avisoPrecios: false }),

      repreciar: (menu) => {
        const { items, cambio } = repreciarItems(get().items, menu)
        if (cambio) set({ items, avisoPrecios: true })
      },

      descartarAvisoPrecios: () => set({ avisoPrecios: false }),

      total: () => get().items.reduce((acc, i) => acc + i.precioUnitario * i.cantidad, 0),
    }),
    // Solo los ítems van al navegador: el aviso de precios es de una sola vez.
    { name: 'menyu_carrito', partialize: (s) => ({ items: s.items }) },
  ),
)
