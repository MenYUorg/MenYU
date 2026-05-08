import type { Pedido } from '../order.types'
import type { LlamadoMozo } from '../waiter.types'

export interface ServerToClientEvents {
  'order:updated': (pedido: Pedido) => void
  'order:new': (pedido: Pedido) => void
  'waiter:called': (llamado: LlamadoMozo) => void
  'session:closed': (sesionId: string) => void
}

export interface ClientToServerEvents {
  'session:join': (sesionId: string) => void
  'waiter:call': (sesionId: string) => void
}
