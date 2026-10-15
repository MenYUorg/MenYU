import { create } from 'zustand'
import { api } from '../services/api'
import { useCarritoStore } from './carritoStore'
import type { MenuPublico, MenuPublicoItem } from '@menyu/types'

interface PublicMenuStore {
  /** El menú del último restaurante pedido (`menu.restaurante.id`): nunca se mezclan los de dos restaurantes. */
  menu: MenuPublico | null
  loading: boolean
  error: string | null
  /** Código HTTP del último error (`null` si no hubo respuesta del servidor, o si no hubo error). */
  errorStatus: number | null
  /** El restaurante cuyo menú se está pidiendo ahora (`null` si no hay un pedido en curso). */
  cargandoDe: string | null
  fetchMenu: (restauranteId: string) => Promise<void>
  getItemById: (id: string) => MenuPublicoItem | undefined
  clear: () => void
}

/** ¿Este menú es el del restaurante con ese id? (los ids son UUID: no importan las mayúsculas). */
export function menuEsDe(menu: MenuPublico | null, restauranteId: string | null | undefined): boolean {
  return !!menu && !!restauranteId && menu.restaurante.id.toLowerCase() === restauranteId.toLowerCase()
}

// Cada pedido lleva un número: la respuesta de un pedido que ya no es el último (se pasó a otro restaurante) se descarta.
let pedidoMenu = 0

export const usePublicMenuStore = create<PublicMenuStore>()((set, get) => ({
  menu: null,
  loading: false,
  error: null,
  errorStatus: null,
  cargandoDe: null,

  fetchMenu: async (restauranteId) => {
    const { loading, cargandoDe, menu: actual } = get()
    // Ya se está pidiendo este mismo menú. Si se pide el de otro restaurante, se descarta el pedido anterior.
    if (loading && cargandoDe === restauranteId) return

    const pedido = ++pedidoMenu
    set({
      loading: true,
      error: null,
      errorStatus: null,
      cargandoDe: restauranteId,
      // El menú de otro restaurante no se muestra mientras llega el pedido.
      menu: menuEsDe(actual, restauranteId) ? actual : null,
    })
    try {
      const menu = await api.menu.publico(restauranteId)
      if (pedido !== pedidoMenu) return
      set({ menu })
      // El carrito se guarda en el navegador: con el menú nuevo se corrigen los precios que cambiaron.
      useCarritoStore.getState().repreciar(menu)
    } catch (e) {
      if (pedido !== pedidoMenu) return
      const status = (e as { status?: unknown } | null)?.status
      set({
        error: e instanceof Error ? e.message : 'Error al cargar el menú',
        errorStatus: typeof status === 'number' ? status : null,
      })
    } finally {
      if (pedido === pedidoMenu) set({ loading: false, cargandoDe: null })
    }
  },

  getItemById: (id) => {
    const menu = get().menu
    if (!menu) return undefined
    for (const cat of menu.categorias) {
      const found = cat.itemsDirectos.find((item) => item.id === id)
      if (found) return found
    }
    // Un plato sin categoría solo aparece en recomendados o en descuentos.
    return (
      (menu.recomendados ?? []).find((item) => item.id === id) ??
      (menu.descuentos ?? []).find((item) => item.id === id)
    )
  },

  clear: () => set({ menu: null, error: null, errorStatus: null }),
}))
