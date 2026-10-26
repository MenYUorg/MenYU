import type { Rol } from '../auth.types'
import type { EstadoMesa, ModoSesion } from '../session.types'

// ── Auth ─────────────────────────────────────────────────────────────────────
// El login propio (`LoginRequest`, `RegisterRequest`, `GuestRequest`, `RefreshTokenRequest`) se retiró en la Fase 5 de
// docs/auth/specs/auth.md: el ingreso es web-auth, con Supabase.

/** `POST /auth/invitaciones`. OWNER va con `marcaId`; los demás roles, con `restauranteId`. */
export interface CrearInvitacionRequest {
  email: string
  nombre: string
  rol: Rol
  marcaId?: string
  restauranteId?: string
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
  direccion: string
}

export interface UpdateRestauranteRequest {
  nombre?: string
  direccion?: string
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

// ── Items ─────────────────────────────────────────────────────────────────────

export interface CreateItemRequest {
  marcaId: string
  nombre: string
  precioBase: number
  descripcion?: string
  comandaId?: string
  disponible?: boolean
  imagenUrl?: string
}

export interface UpdateItemRequest {
  nombre?: string
  precioBase?: number
  descripcion?: string
  comandaId?: string
  disponible?: boolean
  imagenUrl?: string
}

/** Descuento de un ítem (PUT /items/:id/descuento). Se manda exactamente uno de los dos: el backend calcula el otro. */
export interface UpdateItemDescuentoRequest {
  /** Precio con descuento, en pesos enteros. */
  precioDescuento?: number
  /** Porcentaje de descuento, entero de 1 a 99. */
  porcentaje?: number
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
