export type EstadoLlamado = 'pendiente' | 'atendido'

export interface LlamadoMozo {
  id: string
  sesionId: string
  mozoId: string | null
  estado: EstadoLlamado
  createdAt: string
}
