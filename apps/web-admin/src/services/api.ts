import { TOKEN_KEY, REFRESH_KEY } from '@menyu/auth'
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
        window.location.href = '/login'
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
}

export const api = {
  marcas: {
    list: () => req<Marca[]>('GET', '/marcas'),
  },

  restaurantes: {
    list: () => req<Restaurante[]>('GET', '/restaurantes'),
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
