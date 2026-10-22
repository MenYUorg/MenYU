import { irAlLogin, renovarSesion, tokenDeAcceso, urlDeLaApi } from '@menyu/auth-client'
import type { Mesa, EstadoPedido, SesionHistorial } from '@menyu/types'

// ── Base fetch ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Una llamada a la API con el access token de Supabase (docs/auth/specs/auth.md, API). Ante un 401 pide un token nuevo
 * con el refresh token y reintenta una sola vez; si no se pudo, vuelve a web-auth. No usa localStorage: el token sale
 * de la cookie de dominio compartido en cada llamada, así que un logout hecho en otra app se nota acá.
 */
async function enviar(path: string, opciones: RequestInit, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { ...(opciones.headers as Record<string, string> | undefined) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(`${urlDeLaApi()}${path}`, { ...opciones, headers })
}

async function pedir(path: string, opciones: RequestInit): Promise<Response> {
  const res = await enviar(path, opciones, await tokenDeAcceso())
  if (res.status !== 401) return res

  // supabase-js serializa las renovaciones simultáneas con un lock del browser: dos pedidos en paralelo no piden dos.
  const nuevo = await renovarSesion()
  if (!nuevo) {
    irAlLogin()
    throw new ApiError('Sesión expirada', 401)
  }
  return enviar(path, opciones, nuevo)
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  }
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await pedir(path, { ...options, headers })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(
      typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`,
      res.status,
    )
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Response types ────────────────────────────────────────────────────────────

export interface IngredienteInfo {
  nombre: string
  esAlergeno: boolean
}

export interface ItemIngredienteRico {
  id: string
  ingredienteId: string
  ingrediente: IngredienteInfo
  esRemovible: boolean
  esAgregable: boolean
  precioExtra: number
  cantidadMax: number
}

export interface ModRico {
  pedidoItemId: string
  itemIngredienteId: string
  accion: string
  cantidad: number
  itemIngrediente?: { ingrediente?: { nombre: string } }
}

export interface ItemPedidoRico {
  id: string
  itemId: string
  cantidad: number
  cantidadEditada: number | null
  precioUnitario: number
  notas: string | null
  item: { nombre: string }
  mods: ModRico[]
}

export interface PedidoRico {
  id: string
  sesionId: string
  mesaId: string
  estado: string
  createdAt: string
  updatedAt: string
  mesa: { numero: string }
  items: ItemPedidoRico[]
  // La sesión del pedido ya tiene un cobro aprobado (GET /api/pedidos)
  pagado?: boolean
}

export interface MenuIngrediente {
  id: string
  ingredienteId: string
  ingrediente: { id: string; nombre: string; esAlergeno: boolean }
  esRemovible: boolean
  esAgregable: boolean
  precioExtra: number
  cantidadMin: number
  cantidadMax: number
}

export interface MenuItem {
  id: string
  nombre: string
  descripcion: string | null
  precioBase: number
  // El backend siempre manda los tres datos del descuento, ya calculados. Son opcionales por si la API
  // todavía no está actualizada: sin ellos el plato se cobra a precioBase.
  precioDescuento?: number | null
  porcentajeDescuento?: number | null
  precioVigente?: number
  imagenUrl: string | null
  disponible: boolean
  ingredientes: MenuIngrediente[]
}

export interface MenuCategoria {
  id: string
  nombre: string
  orden: number
  itemsDirectos: MenuItem[]
}

export interface MenuResponse {
  categorias: MenuCategoria[]
  recomendados: MenuItem[]
  restaurante: { id: string; nombre: string; nombreSeccionRecomendados: string }
}

export interface WaiterCallRico {
  id: string
  sesionId: string
  mozoId: string | null
  estado: string
  motivo: string | null
  createdAt: string
  sesion: {
    mesa: { numero: string }
  }
}

export interface SesionActivaItem {
  id: string
  mesaId: string
  mesaNumero: string
  tiempoTranscurrido: number
  cantidadItems: number
  cantidadPersonas: number
  totalAcumulado: number
  quierePagar: boolean
}

export type { SesionHistorial } from '@menyu/types'

export interface SesionPagadaItem {
  id: string
  mesaNumero: string
  totalCobrado: number
  metodoPago: string
  cobradoPorNombre: string | null
  referenciaExterna: string | null
  fechaCobro: string | null
  pagos?: {
    id: string
    metodo: string
    estado: string
    cobradoPorNombre: string | null
    referenciaExterna: string | null
    fechaCobro: string | null
  }[]
}

export interface SesionAbierta {
  sesionId: string
  mesaId: string
  restauranteId: string
  codigoSesion: string
  numeroMesa: string
  esNueva: boolean
}

export interface SesionActivaRico {
  sesionId: string
  creadaEn: string
  cantidadClientes: number
  totalAcumulado: number
  llamadoActivo: { id: string; motivo: string } | null
  pedidos: {
    id: string
    estado: string
    createdAt: string
    items: {
      id: string
      cantidad: number
      precioUnitario: number
      itemNombre: string
      modificaciones: { ingredienteNombre: string; tipo: string }[]
    }[]
  }[]
}

export interface CrearPedidoBody {
  sesionId: string
  mesaId: string
  items: {
    itemId: string
    cantidad: number
    notas?: string
    mods?: { itemIngredienteId: string; accion: string; cantidad: number }[]
  }[]
}

export interface EditarItemBody {
  justificacion: string
  ediciones: { pedidoItemId: string; cantidadNueva: number }[]
}

// ── API ───────────────────────────────────────────────────────────────────────

export const api = {
  mesas: {
    getAll: (restauranteId: string) =>
      authFetch<Mesa[]>(`/mesas?restauranteId=${encodeURIComponent(restauranteId)}`),
  },

  pedidos: {
    getByRestaurante: (restauranteId: string, filtros?: { estado?: EstadoPedido | string }) => {
      const params = new URLSearchParams({ restauranteId })
      if (filtros?.estado) params.set('estado', filtros.estado)
      return authFetch<PedidoRico[]>(`/pedidos?${params.toString()}`)
    },

    cambiarEstado: (id: string, estado: string) =>
      authFetch<PedidoRico>(`/pedidos/${id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      }),

    crear: (body: CrearPedidoBody) =>
      authFetch<PedidoRico>('/pedidos/staff', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    editarItem: (pedidoId: string, body: EditarItemBody) =>
      authFetch<PedidoRico>(`/pedidos/${pedidoId}/editar`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  menu: {
    getByRestaurante: (restauranteId: string) =>
      authFetch<MenuResponse>(`/menu/${encodeURIComponent(restauranteId)}`),
  },

  waiterCalls: {
    getAll: (restauranteId: string) =>
      authFetch<WaiterCallRico[]>(
        `/waiter-calls?restauranteId=${encodeURIComponent(restauranteId)}`,
      ),

    atender: (id: string) =>
      authFetch<{ id: string; estado: string; mozoId: string | null }>(
        `/waiter-calls/${id}/atender`,
        { method: 'PATCH' },
      ),
  },

  sesiones: {
    abrir: (mesaId: string) =>
      authFetch<SesionAbierta>('/sessions/open-staff', {
        method: 'POST',
        body: JSON.stringify({ mesaId }),
      }),

    getActiva: (mesaId: string) =>
      authFetch<SesionActivaRico | null>(`/sessions/mesa/${mesaId}/activa`),

    cerrar: (mesaId: string) =>
      authFetch<{ ok: boolean }>(`/sessions/mesa/${mesaId}/cerrar`, { method: 'POST' }),

    getActivas: (restauranteId: string) =>
      authFetch<SesionActivaItem[]>(`/sessions/activas?restauranteId=${encodeURIComponent(restauranteId)}`),

    getPagadas: (restauranteId: string, fecha?: string) => {
      const params = new URLSearchParams({ restauranteId })
      if (fecha) params.set('fecha', fecha)
      return authFetch<SesionPagadaItem[]>(`/sessions/pagadas?${params.toString()}`)
    },

    /**
     * Quién cobró lo deduce el backend de la cuenta (`common/atribucion-del-cobro.ts`): desde la entrega 4.3 el
     * `mozoId` del body se ignora para un MOZO o JEFE_SALON, y `cobradoPorNombre` le ganaría al nombre del mozo en las
     * sesiones pagadas. Por eso no se mandan desde staff.
     */
    registrarCobro: (sesionId: string, body: { metodoPago: string; referenciaExterna?: string; confirmarCancelacionPagosPendientes?: boolean }) =>
      authFetch<{ ok: boolean }>(`/sessions/${sesionId}/cobro`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    historial: (restauranteId: string, desde?: string, hasta?: string) => {
      const params = new URLSearchParams({ restauranteId })
      if (desde) params.set('desde', desde)
      if (hasta) params.set('hasta', hasta)
      return authFetch<SesionHistorial[]>(`/sessions/historial?${params.toString()}`)
    },
  },
}
