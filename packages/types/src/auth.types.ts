export type UserTipo = 'admin' | 'mozo' | 'cliente'
export type RolAdmin = 'ROOT' | 'OWNER' | 'ADMIN'

export interface JwtPayload {
  sub: string
  email?: string
  nombre?: string
  tipo: UserTipo
  rol?: string
  restauranteId?: string
  iat: number
  exp: number
}

export interface SessionJwtPayload {
  sub: string
  tipo: 'cliente'
  sesionId: string
  mesaId: string
  restauranteId: string
  iat: number
  exp: number
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface Admin {
  id: string
  marcaId: string | null
  email: string
  rol: string
}

export interface Mozo {
  id: string
  restauranteId: string
  nombre: string
  email: string | null
  telefono: string | null
  activo: boolean
  esJefeSalon: boolean
  createdAt: string
}

export interface Cliente {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  createdAt: string
}
