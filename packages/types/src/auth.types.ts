// El JWT propio del personal (`UserTipo`, `RolAdmin`, `JwtPayload`, `TokenPair`) y la tabla `Admin` se retiraron en la
// Fase 5 de docs/auth/specs/auth.md: el personal entra con Supabase. Lo que queda acá del JWT propio es el token de la
// sesión de mesa, que lo firma el backend (su propia copia, en `auth/guards/session-auth.guard.ts`, es la que vale).

export interface SessionJwtPayload {
  sub: string
  tipo: 'cliente'
  sesionId: string
  mesaId: string
  restauranteId: string
  iat: number
  exp: number
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
  /** En las demás, con su marca (para el selector de contexto). */
  restaurante: { id: string; nombre: string; marcaId: string; marca: { id: string; nombre: string } } | null
}

/** El usuario autenticado con Supabase y sus permisos según nuestra base. */
export interface PerfilUsuario {
  id: string
  email: string
  nombre: string
  esRoot: boolean
  membresias: MembresiaPerfil[]
}
