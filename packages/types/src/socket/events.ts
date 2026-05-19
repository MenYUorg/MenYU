import type { Pedido } from '../order.types'
import type { LlamadoMozo } from '../waiter.types'

export interface ServerToClientEvents {
  'order:new': (pedido: Pedido) => void
  'order:updated': (pedido: Pedido) => void
  'waiter:called': (llamado: LlamadoMozo) => void
  'session:closed': (sesionId: string) => void
}

export interface ClientToServerEvents {
  'session:join': (data: { restauranteId: string }) => void
  'waiter:call': (sesionId: string) => void
}
