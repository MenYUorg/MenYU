export type UserTipo = 'admin' | 'mozo' | 'cliente'
export type RolAdmin = 'ROOT' | 'OWNER' | 'GERENTE'

export interface JwtPayload {
  sub: string
  email?: string
  nombre?: string
  tipo: UserTipo
  rol?: RolAdmin
  restauranteId?: string
  restauranteNombre?: string
  marcaNombre?: string
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
  rol: RolAdmin
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

// ── Supabase Auth (docs/auth/specs/auth.md) ─────────────────────────────────

/** Rol de una membresía. OWNER es de una marca; los demás, de un restaurante. ROOT no es un rol: es `esRoot`. */
export type Rol = 'OWNER' | 'GERENTE' | 'JEFE_SALON' | 'MOZO' | 'COCINA'

export interface MembresiaPerfil {
  id: string
  rol: Rol
  /** Solo en la de OWNER, con los restaurantes activos de la marca (la membresía los cubre a todos). */
  marca: { id: string; nombre: string; restaurantes: { id: string; nombre: string }[] } | null
  /** En las demás. */
  restaurante: { id: string; nombre: string; marcaId: string } | null
}

/** El usuario autenticado con Supabase y sus permisos según nuestra base. */
export interface PerfilUsuario {
  id: string
  email: string
  nombre: string
  esRoot: boolean
  membresias: MembresiaPerfil[]
}
