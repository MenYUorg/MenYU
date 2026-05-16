import type { ItemCarrito } from './order.types'

export interface ItemCarritoUI extends ItemCarrito {
  nombre: string
  imagenUrl?: string | null
}
