export type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelado'
export type AccionModificacion = 'agregar' | 'quitar'

export interface PedidoItemMod {
  pedidoItemId: string
  itemIngredienteId: string
  accion: AccionModificacion
  cantidad: number
}

export interface PedidoItem {
  id: string
  pedidoId: string
  itemId: string
  clienteId: string | null
  cantidad: number
  precioUnitario: number
  notas: string | null
  mods?: PedidoItemMod[]
}

export interface Pedido {
  id: string
  sesionId: string
  mesaId: string
  estado: EstadoPedido
  createdAt: string
  items?: PedidoItem[]
}

export interface ModificacionIngrediente {
  itemIngredienteId: string
  ingredienteId: string
  accion: AccionModificacion
  cantidad: number
  precioExtra: number
}

export interface ItemCarrito {
  itemMenuId: string
  varianteId?: string
  cantidad: number
  precioBase: number
  modificaciones: ModificacionIngrediente[]
  precioTotal: number
  nota?: string
}
