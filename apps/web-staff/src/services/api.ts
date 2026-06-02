import { TOKEN_KEY } from '@menyu/auth'
import type { Mesa, EstadoPedido } from '@menyu/types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

// ── Token ─────────────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

// ── Base fetch ────────────────────────────────────────────────────────────────

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new Error(
      typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`,
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
  pago?: { estado: string } | null
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

export interface SesionHistorial {
  sesionId: string
  mesaNumero: string
  iniciadaEn: string
  cerradaEn: string
  cantidadPedidos: number
  totalSesion: number
  pedidos: {
    id: string
    estado: string
    createdAt: string
    totalPedido: number
    tieneEdiciones: boolean
    items: {
      id: string
      cantidad: number
      cantidadEditada: number | null
      precioUnitario: number
      itemNombre: string
      mods: {
        accion: string
        ingredienteNombre: string
      }[]
    }[]
    ediciones: {
      id: string
      justificacion: string
      creadoEn: string
      editor: { nombre: string; tipo: 'gerente' | 'mozo' }
      itemsEliminados: {
        itemNombre: string
        cantidadAntes: number
        cantidadDespues: number
        precioUnitario: number
        esAnulacion: boolean
      }[]
    }[]
  }[]
}

export interface SesionPagadaItem {
  id: string
  mesaNumero: string
  totalCobrado: number
  metodoPago: string
  cobradoPorNombre: string | null
  referenciaExterna: string | null
  fechaCobro: string | null
}

export interface MozoSimple {
  id: string
  nombre: string
  activo: boolean
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

    getDetalle: (mesaId: string) =>
      authFetch<Mesa>(`/mesas/${mesaId}`),
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

    registrarCobro: (sesionId: string, body: { metodoPago: string; mozoId?: string; cobradoPorNombre?: string; referenciaExterna?: string }) =>
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

  mozos: {
    list: (restauranteId: string) =>
      authFetch<MozoSimple[]>(`/mozos?restauranteId=${encodeURIComponent(restauranteId)}`),
  },
}
