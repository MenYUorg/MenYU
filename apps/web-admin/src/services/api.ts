import { irAlLogin, renovarSesion, tokenDeAcceso, urlDeLaApi } from '@menyu/auth-client'
import type {
  Marca,
  Restaurante,
  ItemMenu,
  CategoriaMenu,
  Ingrediente,
  ClasificacionDieta,
  LogoResponse,
  UpdateItemDescuentoRequest,
  SesionHistorial,
  RootMarcaResumen,
  RootMarcaDetalle,
  RootRestaurante,
  RootCrearMarcaRequest,
  RootEditarMarcaRequest,
  RootCrearRestauranteRequest,
  RootEditarRestauranteRequest,
  RootHistorialFiltros,
  RootHistorialPagina,
  RootCuentaResumen,
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
    throw new ApiError(401, 'Sesión expirada')
  }
  return enviar(path, opciones, nuevo)
}

async function leerError(res: Response): Promise<never> {
  const err = (await res.json().catch(() => ({}))) as Record<string, unknown>
  throw new ApiError(
    res.status,
    typeof err['message'] === 'string' ? err['message'] : `Error ${res.status}`,
  )
}

/** Para las pantallas que arman su propio pedido (PagosPage). Mismo token, mismo 401 y el mismo `ApiError`. */
export async function pedirJson<T>(path: string, opciones: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opciones.headers as Record<string, string> | undefined) }
  if (opciones.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  const res = await pedir(path, { ...opciones, headers })
  if (!res.ok) return leerError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  return pedirJson<T>(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function upload<T>(path: string, fieldName: string, file: File): Promise<T> {
  const fd = new FormData()
  fd.append(fieldName, file)
  const res = await pedir(path, { method: 'POST', body: fd })
  if (!res.ok) return leerError(res)
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
  // La sesión del pedido ya tiene un cobro aprobado (GET /api/pedidos)
  pagado?: boolean
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

export type { SesionHistorial } from '@menyu/types'

export const api = {
  marcas: {
    list: () => req<Marca[]>('GET', '/marcas'),
    uploadLogo: (id: string, file: File) => upload<LogoResponse>(`/marcas/${id}/logo`, 'logo', file),
    deleteLogo: (id: string) => req<LogoResponse>('DELETE', `/marcas/${id}/logo`),
  },

  restaurantes: {
    list: () => req<Restaurante[]>('GET', '/restaurantes'),
    update: (
      id: string,
      data: { modoSesion?: string; nombreSeccionRecomendados?: string; direccion?: string },
    ) => req<Restaurante>('PATCH', `/restaurantes/${id}`, data),
    uploadLogo: (id: string, file: File) =>
      upload<LogoResponse>(`/restaurantes/${id}/logo`, 'logo', file),
    deleteLogo: (id: string) => req<LogoResponse>('DELETE', `/restaurantes/${id}/logo`),
  },

  items: {
    list: (restauranteId: string) =>
      req<ItemMenu[]>('GET', `/items?restauranteId=${encodeURIComponent(restauranteId)}`),
    get: (id: string) => req<ItemMenu>('GET', `/items/${id}`),
    create: (data: CreateItemInput) => req<ItemMenu>('POST', '/items', data),
    update: (id: string, data: UpdateItemInput) => req<ItemMenu>('PATCH', `/items/${id}`, data),
    delete: (id: string) => req<void>('DELETE', `/items/${id}`),
    setDescuento: (id: string, data: UpdateItemDescuentoRequest) =>
      req<ItemMenu>('PUT', `/items/${id}/descuento`, data),
    quitarDescuento: (id: string) => req<ItemMenu>('DELETE', `/items/${id}/descuento`),
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

  /**
   * Consola de ROOT (`/api/root/*`, solo para ROOT). Ver docs/plan-consola-root.md. Las marcas y los restaurantes no se borran:
   * "dar de baja" es reversible. Dueños y cuentas ROOT todavía no están acá: esperan a la migración de autenticación.
   */
  root: {
    marcas: {
      /** Por defecto solo las activas; con `bajas` también las dadas de baja. */
      listar: (opciones: { bajas?: boolean } = {}) =>
        req<RootMarcaResumen[]>('GET', `/root/marcas${opciones.bajas ? '?bajas=true' : ''}`),
      detalle: (id: string) => req<RootMarcaDetalle>('GET', `/root/marcas/${encodeURIComponent(id)}`),
      crear: (data: RootCrearMarcaRequest) => req<RootMarcaDetalle>('POST', '/root/marcas', data),
      editar: (id: string, data: RootEditarMarcaRequest) =>
        req<RootMarcaDetalle>('PATCH', `/root/marcas/${encodeURIComponent(id)}`, data),
      baja: (id: string) => req<RootMarcaDetalle>('POST', `/root/marcas/${encodeURIComponent(id)}/baja`),
      reactivar: (id: string) => req<RootMarcaDetalle>('POST', `/root/marcas/${encodeURIComponent(id)}/reactivar`),
      crearRestaurante: (marcaId: string, data: RootCrearRestauranteRequest) =>
        req<RootRestaurante>('POST', `/root/marcas/${encodeURIComponent(marcaId)}/restaurantes`, data),
    },
    restaurantes: {
      editar: (id: string, data: RootEditarRestauranteRequest) =>
        req<RootRestaurante>('PATCH', `/root/restaurantes/${encodeURIComponent(id)}`, data),
      baja: (id: string) => req<RootRestaurante>('POST', `/root/restaurantes/${encodeURIComponent(id)}/baja`),
      reactivar: (id: string) => req<RootRestaurante>('POST', `/root/restaurantes/${encodeURIComponent(id)}/reactivar`),
    },
    historial: {
      /** De a 50, de lo más nuevo a lo más viejo. Los filtros vacíos no se mandan. */
      listar: (filtros: RootHistorialFiltros = {}) => {
        const consulta = new URLSearchParams()
        if (filtros.actor) consulta.set('actor', filtros.actor)
        if (filtros.entidad) consulta.set('entidad', filtros.entidad)
        if (filtros.desde) consulta.set('desde', filtros.desde)
        if (filtros.hasta) consulta.set('hasta', filtros.hasta)
        if (filtros.cursor) consulta.set('cursor', String(filtros.cursor))
        const texto = consulta.toString()
        return req<RootHistorialPagina>('GET', `/root/historial${texto ? `?${texto}` : ''}`)
      },
    },
    /** Solo para armar el filtro "Quién" del historial. */
    cuentas: {
      listar: () => req<RootCuentaResumen[]>('GET', '/root/roots'),
    },
  },
}
