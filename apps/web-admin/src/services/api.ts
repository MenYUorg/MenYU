import { TOKEN_KEY, REFRESH_KEY, resolveLoginUrl } from '@menyu/auth'
import type {
  Marca,
  Restaurante,
  ItemMenu,
  CategoriaMenu,
  Ingrediente,
  ClasificacionDieta,
  TokenPair,
} from '@menyu/types'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE = import.meta.env.VITE_API_URL ?? ''

let isRefreshing = false
let refreshQueue: Array<(token: string | null) => void> = []

async function tryRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken) return null
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as TokenPair
    localStorage.setItem(TOKEN_KEY, data.accessToken)
    localStorage.setItem(REFRESH_KEY, data.refreshToken)
    return data.accessToken
  } catch {
    return null
  }
}

async function req<T>(method: string, path: string, body?: unknown, isRetry = false): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && !isRetry) {
    if (!isRefreshing) {
      isRefreshing = true
      const newToken = await tryRefresh()
      isRefreshing = false
      refreshQueue.forEach((cb) => cb(newToken))
      refreshQueue = []
      if (!newToken) {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_KEY)
        window.location.replace(resolveLoginUrl())
        throw new ApiError(401, 'Sesión expirada')
      }
      return req<T>(method, path, body, true)
    }
    return new Promise<T>((resolve, reject) => {
      refreshQueue.push((newToken) => {
        if (!newToken) reject(new ApiError(401, 'Sesión expirada'))
        else req<T>(method, path, body, true).then(resolve).catch(reject)
      })
    })
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(
      res.status,
      typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`,
    )
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function upload<T>(path: string, fieldName: string, file: File): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const fd = new FormData()
  fd.append(fieldName, file)
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(
      res.status,
      typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`,
    )
  }
  return res.json() as Promise<T>
}

export interface CreateItemInput {
  restauranteId: string
  nombre: string
  precioBase: number
  descripcion?: string
  categoriaId?: string
  disponible?: boolean
}

export interface UpdateItemInput {
  nombre?: string
  precioBase?: number
  descripcion?: string
  categoriaId?: string | null
  disponible?: boolean
  esRecomendado?: boolean
}

export interface SesionResumen {
  sesionId: string
  mesaNumero: string
  estado: 'activa' | 'efectivo_solicitado' | 'mp_pendiente' | 'cerrada'
  total: number
  pedidos: { id: string; total: number; estado: string }[]
  pago?: { id: string; metodo: string; estado: string }
  cerradaEn?: string
}

export interface MesaConQr {
  id: string
  restauranteId: string
  numero: string
  qrToken: string
  pin: string
  estado: string
  activo: boolean
  qrImage: string
  mozoMesas?: { id: string; mozoId: string; mozo: { id: string; nombre: string } }[]
}

export interface EdicionAdmin {
  id: string
  justificacion: string
  creadoEn: string
  editor: { nombre: string; tipo: string }
  itemsEliminados: {
    id: string
    itemNombre: string
    cantidadAntes: number
    cantidadDespues: number
    precioUnitario: number
  }[]
}

export interface EdicionAuditoria {
  id: string
  pedidoId: string
  mesaNumero: string
  pedidoEstado: string
  esAnulacion: boolean
  justificacion: string
  creadoEn: string
  editor: { nombre: string; tipo: string }
  itemsEliminados: {
    id: string
    itemNombre: string
    cantidadAntes: number
    cantidadDespues: number
    precioUnitario: number
  }[]
}

export interface ModificacionAdmin {
  accion: 'agregar' | 'quitar' | 'AGREGAR' | 'QUITAR'
  cantidad?: number | null
  itemIngrediente: { ingrediente: { nombre: string } }
}

export interface ItemPedidoAdmin {
  id: string
  cantidad: number
  cantidadEditada: number | null
  precioUnitario: number
  notas: string | null
  item: { nombre: string }
  mods: ModificacionAdmin[]
}

export interface PedidoAdmin {
  id: string
  sesionId: string
  estado: string
  createdAt: string
  updatedAt: string
  mesa: { numero: string }
  pago?: { estado: string } | null
  items: ItemPedidoAdmin[]
}

export interface SesionActiva {
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

export const api = {
  marcas: {
    list: () => req<Marca[]>('GET', '/marcas'),
  },

  restaurantes: {
    list: () => req<Restaurante[]>('GET', '/restaurantes'),
    update: (id: string, data: { modoSesion?: string; nombreSeccionRecomendados?: string }) =>
      req<Restaurante>('PATCH', `/restaurantes/${id}`, data),
  },

  items: {
    list: (restauranteId: string) =>
      req<ItemMenu[]>('GET', `/items?restauranteId=${encodeURIComponent(restauranteId)}`),
    get: (id: string) => req<ItemMenu>('GET', `/items/${id}`),
    create: (data: CreateItemInput) => req<ItemMenu>('POST', '/items', data),
    update: (id: string, data: UpdateItemInput) => req<ItemMenu>('PATCH', `/items/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/items/${id}`),
    uploadImage: (id: string, file: File) =>
      upload<ItemMenu>(`/items/${id}/imagen`, 'imagen', file),
    deleteImage: (id: string) => req<ItemMenu>('DELETE', `/items/${id}/imagen`),
    addIngrediente: (
      itemId: string,
      data: {
        ingredienteId: string
        esOriginal: boolean
        cantidad: number
        esRemovible?: boolean
        esAgregable?: boolean
        precioExtra?: number
        cantidadMin?: number
        cantidadMax?: number
      },
    ) => req<ItemMenu>('POST', `/items/${itemId}/ingredientes`, data),
    updateIngrediente: (
      itemId: string,
      id: string,
      data: {
        esOriginal?: boolean
        esRemovible?: boolean
        esAgregable?: boolean
        precioExtra?: number
        cantidadMax?: number
      },
    ) => req<ItemMenu>('PATCH', `/items/${itemId}/ingredientes/${id}`, data),
    removeIngrediente: (itemId: string, id: string) =>
      req<void>('DELETE', `/items/${itemId}/ingredientes/${id}`),
  },

  categorias: {
    list: (restauranteId: string) =>
      req<CategoriaMenu[]>('GET', `/categorias?restauranteId=${encodeURIComponent(restauranteId)}`),
    create: (data: { nombre: string; restauranteId: string; orden?: number }) =>
      req<CategoriaMenu>('POST', '/categorias', data),
    update: (id: string, data: { nombre?: string; orden?: number }) =>
      req<CategoriaMenu>('PATCH', `/categorias/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/categorias/${id}`),
  },

  ingredientes: {
    list: (restauranteId: string) =>
      req<Ingrediente[]>(
        'GET',
        `/ingredientes?restauranteId=${encodeURIComponent(restauranteId)}`,
      ),
    create: (data: { nombre: string; restauranteId: string; esAlergeno?: boolean }) =>
      req<Ingrediente>('POST', '/ingredientes', data),
    update: (id: string, data: { nombre?: string; esAlergeno?: boolean }) =>
      req<Ingrediente>('PATCH', `/ingredientes/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/ingredientes/${id}`),
  },

  mesas: {
    list: (restauranteId: string) =>
      req<MesaConQr[]>('GET', `/mesas?restauranteId=${encodeURIComponent(restauranteId)}`),
    create: (data: { restauranteId: string; numero: string }) =>
      req<MesaConQr>('POST', '/mesas', data),
    update: (id: string, data: { numero?: string; activo?: boolean }) =>
      req<MesaConQr>('PATCH', `/mesas/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/mesas/${id}`),
    regenerarQr: (id: string) => req<MesaConQr>('POST', `/mesas/${id}/regenerar-qr`),
  },

    pagos: {
      listSesiones: (restauranteId: string) =>
        req<SesionResumen[]>('GET', `/payments/sesiones?restauranteId=${encodeURIComponent(restauranteId)}`),
      confirmarEfectivo: (sesionId: string) =>
        req<{ sesionId: string; estado: string }>('POST', '/payments/confirmar-efectivo', { sesionId }),
    },

    sessions: {
      mesaActiva: (mesaId: string) =>
        req<SesionActiva | null>('GET', `/sessions/mesa/${mesaId}/activa`),
      cerrarMesa: (mesaId: string) =>
        req<{ ok: boolean }>('POST', `/sessions/mesa/${mesaId}/cerrar`),
      openStaff: (mesaId: string) =>
        req<{ sesionId: string; mesaId: string; restauranteId: string; codigoSesion: string; numeroMesa: string; esNueva: boolean }>(
          'POST', '/sessions/open-staff', { mesaId },
        ),
      historial: (restauranteId: string, desde?: string, hasta?: string) =>
        req<SesionHistorial[]>(
          'GET',
          `/sessions/historial?restauranteId=${encodeURIComponent(restauranteId)}${desde ? '&desde=' + desde : ''}${hasta ? '&hasta=' + hasta : ''}`,
        ),
    },

    reportes: {
      ventasHoy: (restauranteId: string, desde?: string, hasta?: string) =>
        req<{ total: number; cantidadPedidos: number; ticketPromedio: number; cantidadSesiones: number }>(
          'GET',
          `/reportes/ventas-hoy?restauranteId=${encodeURIComponent(restauranteId)}${desde ? '&desde=' + desde : ''}${hasta ? '&hasta=' + hasta : ''}`,
        ),
      ventasPorHora: (restauranteId: string, desde?: string, hasta?: string) =>
        req<{ hora: number; total: number }[]>(
          'GET',
          `/reportes/ventas-por-hora?restauranteId=${encodeURIComponent(restauranteId)}${desde ? '&desde=' + desde : ''}${hasta ? '&hasta=' + hasta : ''}`,
        ),
      topItems: (restauranteId: string, limit = 5, desde?: string, hasta?: string) =>
        req<{ itemId: string; nombre: string; cantidad: number; total: number; categoriaId: string | null; categoriaNombre: string | null }[]>(
          'GET',
          `/reportes/top-items?restauranteId=${encodeURIComponent(restauranteId)}&limit=${limit}${desde ? '&desde=' + desde : ''}${hasta ? '&hasta=' + hasta : ''}`,
        ),
      ventasPorDia: (restauranteId: string, desde?: string, hasta?: string) =>
        req<{ fecha: string; total: number; pedidos: number }[]>(
          'GET',
          `/reportes/ventas-por-dia?restauranteId=${encodeURIComponent(restauranteId)}${desde ? '&desde=' + desde : ''}${hasta ? '&hasta=' + hasta : ''}`,
        ),
    },
      
  mozos: {
    list: (restauranteId: string) =>
      req<{ id: string; nombre: string; email: string | null; telefono: string | null; activo: boolean; esJefeSalon: boolean; createdAt: string }[]>(
        'GET', `/mozos?restauranteId=${encodeURIComponent(restauranteId)}`,
      ),
    create: (data: { restauranteId: string; nombre: string; email: string; password: string; esJefeSalon?: boolean }) =>
      req<{ id: string; nombre: string; email: string | null; telefono: string | null; activo: boolean; esJefeSalon: boolean; createdAt: string }>(
        'POST', '/mozos', data,
      ),
    update: (id: string, data: { nombre?: string; email?: string; password?: string; esJefeSalon?: boolean; activo?: boolean }) =>
      req<{ id: string; nombre: string; email: string | null; telefono: string | null; activo: boolean; esJefeSalon: boolean; createdAt: string }>(
        'PATCH', `/mozos/${id}`, data,
      ),
    delete: (id: string) => req<void>('DELETE', `/mozos/${id}`),
    getMesas: (mozoId: string) =>
      req<{ id: string; numero: string; estado: string }[]>('GET', `/mozos/${mozoId}/mesas`),
    assignMesa: (mozoId: string, mesaId: string) =>
      req<{ id: string; mesaId: string; mozoId: string }>('POST', `/mozos/${mozoId}/mesas`, { mesaId }),
    unassignMesa: (mozoId: string, mesaId: string) =>
      req<void>('DELETE', `/mozos/${mozoId}/mesas/${mesaId}`),
    llamadosHoy: (mozoId: string) =>
      req<{ total: number }>('GET', `/mozos/${mozoId}/llamados-hoy`),
  },

  admins: {
    create: (data: { nombre: string; email: string; password: string; restauranteId: string }) =>
      req<{ id: string; email: string; rol: string }>('POST', '/admins', data),
    list: () =>
      req<{ id: string; email: string; rol: string; marcaId: string | null }[]>('GET', '/admins'),
    update: (id: string, data: { email?: string; password?: string }) =>
      req<{ id: string; email: string; rol: string; marcaId: string | null }>('PATCH', `/admins/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/admins/${id}`),
  },

  adminRestaurante: {
    asignar: (adminId: string, restauranteId: string) =>
      req<{ id: string }>('POST', '/admin-restaurante', { adminId, restauranteId }),
    desasignar: (adminId: string, restauranteId: string) =>
      req<void>('DELETE', `/admin-restaurante/${adminId}/${restauranteId}`),
    porAdmin: (adminId: string) =>
      req<{ restauranteId: string; restaurante: { id: string; nombre: string } }[]>(
        'GET', `/admin-restaurante/${adminId}`,
      ),
  },

  pedidos: {
    list: (restauranteId: string, estado: string) =>
      req<PedidoAdmin[]>('GET', `/pedidos?restauranteId=${encodeURIComponent(restauranteId)}&estado=${estado}`),
    cambiarEstado: (id: string, estado: string) =>
      req<PedidoAdmin>('PATCH', `/pedidos/${id}/estado`, { estado }),
    editar: (id: string, data: { justificacion: string; ediciones: { pedidoItemId: string; cantidadNueva: number }[] }) =>
      req<PedidoAdmin>('PATCH', `/pedidos/${id}/editar`, data),
    ediciones: (id: string) =>
      req<EdicionAdmin[]>('GET', `/pedidos/${id}/ediciones`),
    crearStaff: (data: {
      sesionId: string
      mesaId: string
      items: { itemId: string; cantidad: number; notas?: string; mods?: { itemIngredienteId: string; accion: string; cantidad: number }[] }[]
    }) => req<PedidoAdmin>('POST', '/pedidos/staff', data),
    auditoria: (restauranteId: string, desde?: string, hasta?: string) =>
      req<EdicionAuditoria[]>(
        'GET',
        `/pedidos/auditoria?restauranteId=${encodeURIComponent(restauranteId)}${desde ? '&desde=' + desde : ''}${hasta ? '&hasta=' + hasta : ''}&_t=${Date.now()}`,
      ),
  },

  clasificaciones: {
    list: (restauranteId: string) =>
      req<ClasificacionDieta[]>(
        'GET',
        `/clasificaciones?restauranteId=${encodeURIComponent(restauranteId)}`,
      ),
    create: (data: { nombre: string }) => req<ClasificacionDieta>('POST', '/clasificaciones', data),
    update: (id: string, data: { nombre: string }) =>
      req<ClasificacionDieta>('PATCH', `/clasificaciones/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/clasificaciones/${id}`),
    addToItem: (itemId: string, clasificacionId: string) =>
      req<ItemMenu>('POST', `/clasificaciones/items/${itemId}`, { clasificacionId }),
    removeFromItem: (itemId: string, clasificacionId: string) =>
      req<void>('DELETE', `/clasificaciones/items/${itemId}/${clasificacionId}`),
  },
}
