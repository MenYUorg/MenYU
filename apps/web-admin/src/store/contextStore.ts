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

/**
 * Las marcas que la interfaz necesita nombrar. A las del OWNER (`GET /marcas`) se suman las que traen los
 * restaurantes: un GERENTE de un restaurante de otra marca no la tiene en su lista, y sin esto el encabezado
 * mostraba «—» en lugar de su nombre.
 */
function marcasConLasDeLosRestaurantes(propias: Marca[], restaurantes: Restaurante[]): Marca[] {
  const porId = new Map<string, Marca>()
  propias.forEach((m) => porId.set(m.id, m))
  restaurantes.forEach((r) => { if (r.marca && !porId.has(r.marca.id)) porId.set(r.marca.id, r.marca) })
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

/** La carga del contexto que está en vuelo, para que dos llamadas simultáneas no pidan los datos dos veces. */
let cargaEnCurso: Promise<void> | null = null

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
    // El layout y una pantalla que se monta al mismo tiempo (MarcaPage al entrar por la URL) piden el contexto a la
    // vez: comparten la carga en curso en lugar de duplicar los pedidos.
    const enCurso = cargaEnCurso
    if (enCurso) return enCurso

    set({ perfil })
    const esOwner = perfil.membresias.some((m) => m.rol === 'OWNER')
    cargaEnCurso = (async () => {
      try {
        // `GET /marcas` es solo del OWNER: al GERENTE le responde 403 (docs/auth/specs/auth.md, 4.3). Sus marcas salen
        // de los restaurantes, que ya las traen.
        const [restaurantes, marcasDelOwner] = await Promise.all([
          api.restaurantes.list(),
          esOwner ? api.marcas.list() : Promise.resolve(null),
        ])
        const marcas = marcasConLasDeLosRestaurantes(marcasDelOwner ?? [], restaurantes)
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
      } finally {
        cargaEnCurso = null
      }
    })()
    return cargaEnCurso
  },

  setMarca: (id) => set({ selectedMarcaId: id }),
  setRestaurante: (id) => {
    localStorage.setItem(RESTAURANTE_KEY, id)
    // La marca acompaña al restaurante: si no, el encabezado sigue mostrando la marca del restaurante anterior.
    const marcaId = get().restaurantes.find((r) => r.id === id)?.marcaId
    set({ selectedRestauranteId: id, ...(marcaId ? { selectedMarcaId: marcaId } : {}) })
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
