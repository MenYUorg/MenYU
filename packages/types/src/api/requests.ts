import type { EstadoMesa, ModoSesion } from '../session.types'

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  nombre: string
  email: string
  password: string
  telefono?: string
}

export interface GuestRequest {
  nombre?: string
}

export interface RefreshTokenRequest {
  refreshToken: string
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

export interface OpenSessionRequest {
  tableCode?: string
  restaurantId?: string
  pin?: string
  codigoSesion?: string
}

// ── Mesas ─────────────────────────────────────────────────────────────────────

export interface CreateMesaRequest {
  restauranteId: string
  numero: string
  estado?: EstadoMesa
}

export interface UpdateMesaRequest {
  numero?: string
  estado?: EstadoMesa
}

export interface CambiarPinRequest {
  pin: string
}

// ── Marca ─────────────────────────────────────────────────────────────────────

export interface CreateMarcaRequest {
  nombre: string
  slug: string
}

export interface UpdateMarcaRequest {
  nombre?: string
  slug?: string
}

// ── Restaurante ───────────────────────────────────────────────────────────────

export interface CreateRestauranteRequest {
  marcaId: string
  nombre: string
  direccion?: string
  qrBaseUrl?: string
}

export interface UpdateRestauranteRequest {
  nombre?: string
  direccion?: string
  qrBaseUrl?: string
  modoSesion?: ModoSesion
}

// ── Categorías ────────────────────────────────────────────────────────────────

export interface CreateCategoriaRequest {
  restauranteId: string
  nombre: string
  orden?: number
}

export interface UpdateCategoriaRequest {
  nombre?: string
  orden?: number
}

export interface CreateSubcategoriaRequest {
  nombre: string
  orden?: number
}

export interface UpdateSubcategoriaRequest {
  nombre?: string
  orden?: number
}

// ── Items ─────────────────────────────────────────────────────────────────────

export interface CreateItemRequest {
  marcaId: string
  nombre: string
  precioBase: number
  descripcion?: string
  subcategoriaId?: string
  comandaId?: string
  disponible?: boolean
  imagenUrl?: string
}

export interface UpdateItemRequest {
  nombre?: string
  precioBase?: number
  descripcion?: string
  subcategoriaId?: string
  comandaId?: string
  disponible?: boolean
  imagenUrl?: string
}

export interface AddIngredienteRequest {
  ingredienteId: string
  esOriginal: boolean
  cantidad: number
  removible?: boolean
}

export interface UpdateIngredienteItemRequest {
  cantidad?: number
  removible?: boolean
  esOriginal?: boolean
}
