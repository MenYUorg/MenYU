import { create } from 'zustand'
import { usePerfil } from '@menyu/auth-client'
import { api } from '../services/api'
import type { Marca, PerfilUsuario, Restaurante } from '@menyu/types'

const RESTAURANTE_KEY = 'menyu-admin-restaurante-id'

/** Los dos roles que trabajan en web-admin. ROOT no es uno: tiene su propia consola en /root. */
export type RolDeAdmin = 'OWNER' | 'GERENTE'

/** Lo que eligió la persona en web-auth y viaja en la URL (`?marcaId=` o `?restauranteId=`): es una preferencia, no un permiso. */
export interface PreferenciaDeContexto {
  marcaId?: string | null
  restauranteId?: string | null
}

/** Lo que web-auth dejó en la URL (`?marcaId=` o `?restauranteId=`). */
export function preferenciaDeLaUrl(busqueda: string): PreferenciaDeContexto {
  const params = new URLSearchParams(busqueda)
  return { marcaId: params.get('marcaId'), restauranteId: params.get('restauranteId') }
}

function esOwnerDeLaMarca(perfil: PerfilUsuario, marcaId: string): boolean {
  return perfil.membresias.some((m) => m.rol === 'OWNER' && m.marca?.id === marcaId)
}

/**
 * El rol en el restaurante elegido: una persona puede ser OWNER de una marca y GERENTE de un restaurante de otra. Si
 * todavía no hay restaurante elegido (el contexto está cargando), sale de las membresías, para que la interfaz no
 * quede sin permisos mientras tanto. Los permisos de verdad los decide el backend en cada pedido.
 */
export function rolEnElRestaurante(
  perfil: PerfilUsuario | null,
  restaurantes: Restaurante[],
  restauranteId: string | null,
): RolDeAdmin | null {
  if (!perfil) return null
  const elegido = restaurantes.find((r) => r.id === restauranteId)
  if (elegido) {
    if (esOwnerDeLaMarca(perfil, elegido.marcaId)) return 'OWNER'
    if (perfil.membresias.some((m) => m.rol === 'GERENTE' && m.restaurante?.id === elegido.id)) return 'GERENTE'
    return null
  }
  if (perfil.membresias.some((m) => m.rol === 'OWNER')) return 'OWNER'
  if (perfil.membresias.some((m) => m.rol === 'GERENTE')) return 'GERENTE'
  return null
}

function marcasDeLosRestaurantes(restaurantes: Restaurante[]): Marca[] {
  const porId = new Map<string, Marca>()
  restaurantes.forEach((r) => { if (r.marca) porId.set(r.marca.id, r.marca) })
  return Array.from(porId.values())
}

function elegirRestaurante(
  restaurantes: Restaurante[],
  preferencia: PreferenciaDeContexto | undefined,
  actual: string | null,
): string | null {
  const siEstá = (id: string | null | undefined) => (id && restaurantes.some((r) => r.id === id) ? id : null)
  const primeroDeLaMarca = preferencia?.marcaId
    ? (restaurantes.find((r) => r.marcaId === preferencia.marcaId)?.id ?? null)
    : null
  return (
    siEstá(preferencia?.restauranteId) ??
    primeroDeLaMarca ??
    siEstá(actual) ??
    siEstá(localStorage.getItem(RESTAURANTE_KEY)) ??
    restaurantes[0]?.id ??
    null
  )
}

interface ContextStore {
  marcas: Marca[]
  restaurantes: Restaurante[]
  selectedMarcaId: string | null
  selectedRestauranteId: string | null
  /** El perfil con el que se cargó el contexto, para poder recargarlo sin volver a pedirlo. */
  perfil: PerfilUsuario | null
  loadContext: (perfil: PerfilUsuario, preferencia?: PreferenciaDeContexto) => Promise<void>
  /** Vuelve a leer marcas y restaurantes (después de cambiar un logo o la dirección), sin tocar lo elegido. */
  refreshContext: () => Promise<void>
  setMarca: (id: string) => void
  setRestaurante: (id: string) => void
}

export const useContextStore = create<ContextStore>()((set, get) => ({
  marcas: [],
  restaurantes: [],
  selectedMarcaId: null,
  selectedRestauranteId: localStorage.getItem(RESTAURANTE_KEY),
  perfil: null,

  refreshContext: async () => {
    const { perfil, loadContext } = get()
    if (perfil) await loadContext(perfil)
  },

  loadContext: async (perfil, preferencia) => {
    set({ perfil })
    const esOwner = perfil.membresias.some((m) => m.rol === 'OWNER')
    try {
      // `GET /marcas` es solo del OWNER: al GERENTE le responde 403 (docs/auth/specs/auth.md, 4.3). Sus marcas salen
      // de los restaurantes, que ya las traen.
      const [restaurantes, marcasDelOwner] = await Promise.all([
        api.restaurantes.list(),
        esOwner ? api.marcas.list() : Promise.resolve(null),
      ])
      const marcas = marcasDelOwner ?? marcasDeLosRestaurantes(restaurantes)
      const selectedRestauranteId = elegirRestaurante(restaurantes, preferencia, get().selectedRestauranteId)
      if (selectedRestauranteId) localStorage.setItem(RESTAURANTE_KEY, selectedRestauranteId)

      const marcaDelRestaurante = restaurantes.find((r) => r.id === selectedRestauranteId)?.marcaId ?? null
      const marcaPreferida = preferencia?.marcaId && marcas.some((m) => m.id === preferencia.marcaId)
        ? preferencia.marcaId
        : null

      set({
        marcas,
        restaurantes,
        selectedMarcaId: marcaDelRestaurante ?? marcaPreferida ?? marcas[0]?.id ?? null,
        selectedRestauranteId,
      })
    } catch {
      // Un 401 lo resuelve services/api (renueva la sesión o vuelve a web-auth); un 403 deja el contexto vacío.
    }
  },

  setMarca: (id) => set({ selectedMarcaId: id }),
  setRestaurante: (id) => {
    localStorage.setItem(RESTAURANTE_KEY, id)
    set({ selectedRestauranteId: id })
  },
}))

/**
 * El rol de la persona en el restaurante elegido, para la navegación y los guards de la interfaz. Lo usan en lugar del
 * rol del token, que ya no existe: el perfil puede traer OWNER de una marca y GERENTE de un restaurante de otra.
 */
export function useRolActual(): RolDeAdmin | null {
  const perfil = usePerfil()
  const restaurantes = useContextStore((s) => s.restaurantes)
  const selectedRestauranteId = useContextStore((s) => s.selectedRestauranteId)
  return rolEnElRestaurante(perfil, restaurantes, selectedRestauranteId)
}
