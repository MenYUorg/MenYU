// @menyu/types — tipos compartidos del dominio MenYu
// Se irán completando sprint a sprint

export type EstadoPedido = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO' | 'CANCELADO'
export type EstadoSesion = 'ABIERTA' | 'CERRADA' | 'PAGANDO'
export type EstadoLlamado = 'PENDIENTE' | 'ATENDIDO'
export type RolUsuario = 'ADMIN' | 'MOZO' | 'COCINA' | 'CLIENTE'

// ── Auth ──────────────────────────────────────────────────────────────────────

export type UserTipo = 'admin' | 'mozo' | 'cliente'

export interface JwtPayload {
  sub: string
  email?: string
  nombre?: string
  tipo: UserTipo
  rol?: string
  iat: number
  exp: number
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}
