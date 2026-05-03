import type { TokenPair, Marca, Restaurante, ItemMenu, CategoriaMenu, SubcategoriaMenu, Ingrediente } from '@menyu/types'

const BASE = import.meta.env.VITE_API_URL ?? ''

export const TOKEN_KEY = 'menyu_access_token'
export const REFRESH_KEY = 'menyu_refresh_token'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function tok(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const t = tok()
  const headers: Record<string, string> = {}
  if (t) headers['Authorization'] = `Bearer ${t}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const message = typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function upload<T>(path: string, fieldName: string, file: File): Promise<T> {
  const t = tok()
  const fd = new FormData()
  fd.append(fieldName, file)

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    body: fd,
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const message = typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`
    throw new ApiError(res.status, message)
  }

  return res.json() as Promise<T>
}

export interface CreateItemInput {
  marcaId: string
  nombre: string
  precioBase: number
  descripcion?: string
  subcategoriaId?: string
  disponible?: boolean
}

export interface UpdateItemInput {
  nombre?: string
  precioBase?: number
  descripcion?: string
  subcategoriaId?: string | null
  disponible?: boolean
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      req<TokenPair>('POST', '/auth/login', { email, password }),
  },

  marcas: {
    list: () => req<Marca[]>('GET', '/marcas'),
  },

  restaurantes: {
    list: () => req<Restaurante[]>('GET', '/restaurantes'),
  },

  items: {
    list: (marcaId: string) =>
      req<ItemMenu[]>('GET', `/items?marcaId=${encodeURIComponent(marcaId)}`),
    get: (id: string) => req<ItemMenu>('GET', `/items/${id}`),
    create: (data: CreateItemInput) => req<ItemMenu>('POST', '/items', data),
    update: (id: string, data: UpdateItemInput) => req<ItemMenu>('PATCH', `/items/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/items/${id}`),
    uploadImage: (id: string, file: File) =>
      upload<ItemMenu>(`/items/${id}/imagen`, 'imagen', file),
    deleteImage: (id: string) => req<ItemMenu>('DELETE', `/items/${id}/imagen`),
  },

  categorias: {
    list: (restauranteId: string) =>
      req<CategoriaMenu[]>(
        'GET',
        `/categorias?restauranteId=${encodeURIComponent(restauranteId)}`,
      ),
    create: (data: { nombre: string; restauranteId: string; orden?: number }) =>
      req<CategoriaMenu>('POST', '/categorias', data),
    update: (id: string, data: { nombre?: string; orden?: number }) =>
      req<CategoriaMenu>('PATCH', `/categorias/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/categorias/${id}`),
    createSub: (categoriaId: string, data: { nombre: string; orden?: number }) =>
      req<SubcategoriaMenu>('POST', `/categorias/${categoriaId}/subcategorias`, data),
    updateSub: (id: string, data: { nombre?: string; orden?: number }) =>
      req<SubcategoriaMenu>('PATCH', `/categorias/subcategorias/${id}`, data),
    deleteSub: (id: string) => req<void>('DELETE', `/categorias/subcategorias/${id}`),
  },

  ingredientes: {
    list: (restauranteId: string) =>
      req<Ingrediente[]>('GET', `/ingredientes?restauranteId=${encodeURIComponent(restauranteId)}`),
    create: (data: { nombre: string; restauranteId: string }) =>
      req<Ingrediente>('POST', '/ingredientes', data),
    update: (id: string, data: { nombre: string }) =>
      req<Ingrediente>('PATCH', `/ingredientes/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/ingredientes/${id}`),
  },
}
