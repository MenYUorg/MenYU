import { create } from 'zustand'
import type { DiscoveryBusquedaResponse, DiscoveryOferta, DiscoveryRestaurante } from '@menyu/types'
import { api } from '../services/api'

/** La búsqueda pide al menos 2 caracteres (se cuentan caracteres, no unidades de UTF-16: un emoji es uno). */
export const MIN_CARACTERES_BUSQUEDA = 2

export const cantidadDeCaracteres = (texto: string) => Array.from(texto.trim()).length

type EstadoListado = 'inicial' | 'cargando' | 'listo' | 'error'
type EstadoBusqueda = 'inactiva' | 'buscando' | 'listo' | 'error'
type EstadoDetalle = 'cargando' | 'listo' | 'noEncontrado' | 'error'

/** Un restaurante con sus ofertas (lo que necesita su pantalla). `id` es el que se pidió. */
export interface DetalleRestaurante {
  id: string
  estado: EstadoDetalle
  restaurante: DiscoveryRestaurante | null
  ofertas: DiscoveryOferta[]
}

interface DiscoveryStore {
  restaurantes: DiscoveryRestaurante[]
  ofertas: DiscoveryOferta[]
  estado: EstadoListado
  /** Trae el listado. Si ya hay datos de antes, quedan a la vista mientras se actualiza (y si falla, quedan). */
  cargar: () => Promise<void>

  /** El texto de la última búsqueda pedida (ya recortado). */
  textoBuscado: string
  resultados: DiscoveryBusquedaResponse | null
  estadoBusqueda: EstadoBusqueda
  /** Busca. Con menos de 2 caracteres borra la búsqueda. Si llegan respuestas fuera de orden, vale la última pedida. */
  buscar: (texto: string) => Promise<void>
  limpiarBusqueda: () => void

  /** El último restaurante pedido por su id (para su pantalla y la de ingreso a mesa). */
  detalle: DetalleRestaurante | null
  /**
   * Trae un restaurante. Si ya está a la vista el mismo, queda mientras se actualiza (y si falla, queda); un 404 siempre
   * lo marca como no encontrado. Si se pide otro mientras llega la respuesta, la vieja se descarta.
   */
  cargarRestaurante: (id: string) => Promise<void>
}

// Cada pedido lleva un número: una respuesta que llega después de que se pidió otra (o de que se borró la búsqueda) se descarta.
let pedidoListado = 0
let pedidoBusqueda = 0
let pedidoDetalle = 0

export const useDiscoveryStore = create<DiscoveryStore>()((set, get) => ({
  restaurantes: [],
  ofertas: [],
  estado: 'inicial',

  cargar: async () => {
    const pedido = ++pedidoListado
    const hayDatos = get().estado === 'listo'
    set({ estado: hayDatos ? 'listo' : 'cargando' })
    try {
      const datos = await api.discovery.listar()
      if (pedido !== pedidoListado) return
      set({ restaurantes: datos.restaurantes, ofertas: datos.ofertas, estado: 'listo' })
    } catch {
      if (pedido !== pedidoListado) return
      // Con datos de antes se sigue mostrando lo que había; sin datos, se avisa.
      set({ estado: get().restaurantes.length || get().ofertas.length ? 'listo' : 'error' })
    }
  },

  textoBuscado: '',
  resultados: null,
  estadoBusqueda: 'inactiva',

  buscar: async (texto) => {
    const q = texto.trim()
    if (cantidadDeCaracteres(q) < MIN_CARACTERES_BUSQUEDA) {
      get().limpiarBusqueda()
      return
    }
    const pedido = ++pedidoBusqueda
    // Los resultados anteriores quedan mientras llegan los nuevos: la pantalla los atenúa en lugar de vaciarse.
    set({ textoBuscado: q, estadoBusqueda: 'buscando' })
    try {
      const resultados = await api.discovery.buscar(q)
      if (pedido !== pedidoBusqueda) return
      set({ resultados, estadoBusqueda: 'listo' })
    } catch {
      if (pedido !== pedidoBusqueda) return
      set({ estadoBusqueda: 'error' })
    }
  },

  limpiarBusqueda: () => {
    pedidoBusqueda++
    set({ textoBuscado: '', resultados: null, estadoBusqueda: 'inactiva' })
  },

  detalle: null,

  cargarRestaurante: async (id) => {
    const pedido = ++pedidoDetalle
    const actual = get().detalle
    const yaEstaALaVista = actual?.id === id && actual.estado === 'listo'
    set({ detalle: yaEstaALaVista ? actual : { id, estado: 'cargando', restaurante: null, ofertas: [] } })
    try {
      const { restaurante, ofertas } = await api.discovery.restaurante(id)
      if (pedido !== pedidoDetalle) return
      set({ detalle: { id, estado: 'listo', restaurante, ofertas } })
    } catch (error) {
      if (pedido !== pedidoDetalle) return
      const noExiste = (error as { status?: unknown } | null)?.status === 404
      if (yaEstaALaVista && !noExiste) return
      set({ detalle: { id, estado: noExiste ? 'noEncontrado' : 'error', restaurante: null, ofertas: [] } })
    }
  },
}))

/** Solo para los tests: vuelve el store y los contadores al principio. */
export function reiniciarDiscoveryStore() {
  pedidoListado = 0
  pedidoBusqueda = 0
  pedidoDetalle = 0
  useDiscoveryStore.setState({
    detalle: null,
    restaurantes: [],
    ofertas: [],
    estado: 'inicial',
    textoBuscado: '',
    resultados: null,
    estadoBusqueda: 'inactiva',
  })
}
