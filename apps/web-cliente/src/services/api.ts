import type { MenuPublico } from '@menyu/types'

const BASE = import.meta.env.VITE_API_URL ?? ''

async function req<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new Error(
      typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`,
    )
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  menu: {
    publico: (
      restauranteId: string,
      params?: {
        categoriaId?: string
        buscar?: string
        dieta?: string[]
        evitarAlergenos?: boolean
      },
    ) => {
      const q = new URLSearchParams()
      if (params?.categoriaId) q.set('categoriaId', params.categoriaId)
      if (params?.buscar) q.set('buscar', params.buscar)
      if (params?.evitarAlergenos) q.set('evitarAlergenos', 'true')
      params?.dieta?.forEach((d) => q.append('dieta', d))
      const qs = q.toString()
      return req<MenuPublico>('GET', `/menu/${restauranteId}${qs ? `?${qs}` : ''}`)
    },
  },

  sessions: {
    open: (data: {
      qrToken?: string
      restauranteId?: string
      pin?: string
      codigoSesion?: string
    }) =>
      req<{ sesionId: string; mesaId: string; restauranteId: string; esAnfitrion: boolean; codigoSesion: string; jwt: string; numeroMesa: string; modoSesion: string }>(
        'POST',
        '/sessions/open',
        { tableCode: data.qrToken, restauranteId: data.restauranteId, pin: data.pin, codigoSesion: data.codigoSesion },
      ),
  },

  waiterCalls: {
    llamar: (sesionId: string, jwt: string, motivo?: string) =>
      req<{ ok: boolean }>('POST', '/waiter-calls', { sesionId, motivo }, jwt),
  },

  orders: {
    list: (jwt: string) => req<unknown[]>('GET', '/orders', undefined, jwt),
    create: (
      jwt: string,
      items: Array<{
        itemMenuId: string
        cantidad: number
        nota?: string
        modificaciones: Array<{ itemIngredienteId: string; accion: 'agregar' | 'quitar'; cantidad: number }>
      }>,
    ) => req<{ id: string }>('POST', '/orders', { items }, jwt),
  },

  payments: {
    initiate: (
      jwt: string,
      data: {
        pedidoId: string
        restauranteId: string
        sesionId: string
        monto: number
        descripcion: string
      },
    ) =>
      req<{ id: string; initPoint: string; externalReference: string; pagoId: string }>(
        'POST',
        '/payments/initiate',
        { ...data, returnBaseUrl: window.location.origin },
        jwt,
      ),
  },
}
