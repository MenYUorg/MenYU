import type { MenuPublico } from '@menyu/types'

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

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
    throw new ApiError(
      typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`,
      res.status,
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
    solicitarEfectivo: (sesionId: string, comensalId: string | null, modo: 'partes_iguales' | 'por_consumo' | null) =>
      req<{ pagoId: string; sesionId: string; estado: string }>(
        'POST',
        '/payments/solicitar-efectivo',
        { sesionId, comensalId, modo },
      ),
    pagarConMercadoPago: (sesionId: string, comensalId: string | null, modo: 'partes_iguales' | 'por_consumo' | null) =>
      req<{ initPoint: string; preferenceId: string }>(
        'POST',
        '/payments/mercadopago/crear-preferencia',
        { sesionId, comensalId, modo },
      ),
  },

  comensales: {
    crear: (sesionId: string, nombre: string, esOwner: boolean, creadoPorComensalId?: string) =>
      req<{ id: string; sesionId: string; nombre: string; esOwner: boolean; creadoPorComensalId: string | null }>(
        'POST',
        `/sesiones/${sesionId}/comensales`,
        { nombre, esOwner, ...(creadoPorComensalId ? { creadoPorComensalId } : {}) },
      ),
    reclamar: (sesionId: string, nombre: string, pin: string) =>
      req<{
        id: string
        sesionId: string
        clienteId: string | null
        nombre: string
        esOwner: boolean
        createdAt: string
        tienePagoAprobado: boolean
      }>(
        'POST',
        `/sesiones/${sesionId}/comensales/reclamar`,
        { nombre, pin },
      ),
    listar: (sesionId: string) =>
      req<Array<{
        id: string
        sesionId: string
        clienteId: string | null
        nombre: string
        esOwner: boolean
        creadoPorComensalId: string | null
        createdAt: string
      }>>('GET', `/sesiones/${sesionId}/comensales`),
    setCantidadComensales: (sesionId: string, cantidadComensales: number | null) =>
      req<{ id: string; cantidadComensales: number | null }>(
        'PATCH',
        `/sesiones/${sesionId}/comensales/cantidad-comensales`,
        { cantidadComensales },
      ),
    calcularPartesIguales: (sesionId: string) =>
      req<{
        divisionPagosHabilitada: boolean
        divisor: number
        partes: Array<{ comensalId: string; nombre: string; montoCentavos: number; monto: number }>
      }>('GET', `/sesiones/${sesionId}/comensales/division/partes-iguales`),
    calcularPorConsumo: (sesionId: string) =>
      req<{
        divisionPagosHabilitada: boolean
        divisor: number
        partes: Array<{ comensalId: string; nombre: string; montoCentavos: number; monto: number }>
        huerfanos: {
          items: Array<{ pedidoItemId: string; nombre: string; montoCentavos: number; monto: number }>
          totalCentavos: number
          total: number
        }
      }>('GET', `/sesiones/${sesionId}/comensales/division/por-consumo`),
    obtenerModoDivision: (sesionId: string) =>
      req<{ modoDivision: 'partes_iguales' | 'por_consumo' | null }>(
        'GET',
        `/sesiones/${sesionId}/comensales/division/modo`,
      ),
    etiquetar: (sesionId: string, pedidoItemId: string, comensalId: string) =>
      req<{ id: string; pedidoItemId: string; comensalId: string; createdAt: string }>(
        'POST',
        `/sesiones/${sesionId}/comensales/etiquetas`,
        { pedidoItemId, comensalId },
      ),
    desetiquetar: (sesionId: string, pedidoItemId: string, comensalId: string) =>
      req<void>(
        'DELETE',
        `/sesiones/${sesionId}/comensales/etiquetas/${pedidoItemId}/${comensalId}`,
      ),
    listarEtiquetasDeItem: (sesionId: string, pedidoItemId: string) =>
      req<Array<{
        id: string
        pedidoItemId: string
        comensalId: string
        createdAt: string
        comensal: { id: string; sesionId: string; clienteId: string | null; nombre: string; esOwner: boolean; creadoPorComensalId: string | null; createdAt: string }
      }>>('GET', `/sesiones/${sesionId}/comensales/etiquetas/${pedidoItemId}`),
    borrarComensal: (sesionId: string, comensalId: string, solicitante: string) =>
      req<{ id: string }>(
        'DELETE',
        `/sesiones/${sesionId}/comensales/${comensalId}?solicitante=${encodeURIComponent(solicitante)}`,
      ),
  },

  sesiones: {
    saldo: (sesionId: string) =>
      req<{ totalSesion: number; totalCobrado: number; saldoPendiente: number }>(
        'GET',
        `/sesiones/${sesionId}/saldo`,
      ),
  },

  auth: {
    login: (email: string, password: string) =>
      req<{ accessToken: string; refreshToken: string }>('POST', '/auth/login', { email, password }),
    register: (nombre: string, email: string, password: string, telefono?: string) =>
      req<{ accessToken: string; refreshToken: string }>(
        'POST',
        '/auth/register',
        { nombre, email, password, ...(telefono ? { telefono } : {}) },
      ),
  },

  marca: {
    publicas: () =>
      req<Array<{ id: string; nombre: string; restaurantesActivos: number }>>('GET', '/marca/publicas'),
    restaurantes: (marcaId: string) =>
      req<Array<{ id: string; nombre: string; direccion: string | null }>>('GET', `/marca/${marcaId}/restaurantes`),
  },
}
