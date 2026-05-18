export type EstadoPago = 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado'

export interface Pago {
  id: string
  pedidoId: string
  monto: number
  metodo: string
  estado: EstadoPago
  referenciaExterna: string | null
  createdAt: string
}
