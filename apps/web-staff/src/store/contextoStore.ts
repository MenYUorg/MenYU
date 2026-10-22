import { create } from 'zustand'
import { usePerfil } from '@menyu/auth-client'
import type { PerfilUsuario, Rol } from '@menyu/types'

const RESTAURANTE_KEY = 'menyu-staff-restaurante-id'

/** Un restaurante donde la persona trabaja, tal como lo nombra la interfaz. Sale del perfil, no de la API. */
export interface RestauranteDeStaff {
  id: string
  nombre: string
  marcaNombre: string | null
}

/**
 * Lo que eligió la persona en web-auth y viaja en la URL: es una preferencia, no un permiso. Acá solo importa
 * `?restauranteId=`, que es con lo que web-auth manda a `/mozo` y a `/cocina`; una marca no identifica un restaurante y
 * todas las pantallas de staff son de uno.
 */
export interface PreferenciaDeContexto {
  restauranteId?: string | null
}

export function preferenciaDeLaUrl(busqueda: string): PreferenciaDeContexto {
  return { restauranteId: new URLSearchParams(busqueda).get('restauranteId') }
}

/**
 * Los restaurantes del perfil (`GET /auth/me`), ordenados por nombre. La membresía OWNER es de la marca y trae sus
 * sucursales; las demás, un restaurante. Una persona puede llegar al mismo restaurante por dos membresías (OWNER de la
 * marca y MOZO de la sucursal): aparece una sola vez.
 */
export function restaurantesDelPerfil(perfil: PerfilUsuario | null): RestauranteDeStaff[] {
  if (!perfil) return []
  const porId = new Map<string, RestauranteDeStaff>()
  for (const membresia of perfil.membresias) {
    if (membresia.marca) {
      for (const restaurante of membresia.marca.restaurantes) {
        if (!porId.has(restaurante.id)) {
          porId.set(restaurante.id, { ...restaurante, marcaNombre: membresia.marca.nombre })
        }
      }
    }
    if (membresia.restaurante) {
      const { id, nombre, marca } = membresia.restaurante
      if (!porId.has(id)) porId.set(id, { id, nombre, marcaNombre: marca.nombre })
    }
  }
  return Array.from(porId.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Todos los roles de la persona en un restaurante, no uno solo: la cuenta que es OWNER de la marca y MOZO de la
 * sucursal puede lo de los dos. La membresía OWNER cubre todas las sucursales de su marca. Los permisos de verdad los
 * decide el backend en cada pedido (docs/auth/specs/auth.md, 4.3).
 */
export function rolesEnElRestaurante(perfil: PerfilUsuario | null, restauranteId: string | null): Rol[] {
  if (!perfil || !restauranteId) return []
  const roles = new Set<Rol>()
  for (const membresia of perfil.membresias) {
    if (membresia.marca?.restaurantes.some((r) => r.id === restauranteId)) roles.add(membresia.rol)
    if (membresia.restaurante?.id === restauranteId) roles.add(membresia.rol)
  }
  return Array.from(roles)
}

const alguno = (roles: Rol[], permitidos: Rol[]) => roles.some((rol) => permitidos.includes(rol))

/** Quién ve la vista de cocina y quién la del mozo (docs/auth/specs/auth.md, Roles). */
export const puedeVerCocina = (roles: Rol[]) => alguno(roles, ['COCINA', 'OWNER', 'GERENTE'])
export const puedeVerMozo = (roles: Rol[]) => alguno(roles, ['MOZO', 'JEFE_SALON', 'OWNER', 'GERENTE'])

/** Atender un llamado necesita el `Mozo` de la cuenta: un OWNER o GERENTE recibe 403 (matriz de la 4.3). */
export const puedeAtenderLlamados = (roles: Rol[]) => alguno(roles, ['MOZO', 'JEFE_SALON'])

/** Editar un pedido es de GERENTE, JEFE_SALON y MOZO: el OWNER no edita, como antes de la migración. */
export const puedeEditarPedidos = (roles: Rol[]) => alguno(roles, ['GERENTE', 'JEFE_SALON', 'MOZO'])

/**
 * Con qué restaurante entra. La preferencia de la URL manda, después el último elegido y, si trabaja en uno solo, ese.
 * Con varios y sin preferencia queda en null y la persona elige en el selector.
 */
function elegirRestaurante(
  restaurantes: RestauranteDeStaff[],
  preferencia: PreferenciaDeContexto | undefined,
): string | null {
  const siEstá = (id: string | null | undefined) => (id && restaurantes.some((r) => r.id === id) ? id : null)
  return (
    siEstá(preferencia?.restauranteId) ??
    siEstá(localStorage.getItem(RESTAURANTE_KEY)) ??
    (restaurantes.length === 1 ? restaurantes[0].id : null)
  )
}

interface ContextoStore {
  restaurantes: RestauranteDeStaff[]
  restauranteId: string | null
  perfil: PerfilUsuario | null
  /** Arma la lista con el perfil y elige el restaurante. No pide nada a la API: todo viene en `GET /auth/me`. */
  cargarContexto: (perfil: PerfilUsuario, preferencia?: PreferenciaDeContexto) => void
  setRestaurante: (id: string) => void
}

export const useContextoStore = create<ContextoStore>()((set) => ({
  restaurantes: [],
  restauranteId: null,
  perfil: null,

  cargarContexto: (perfil, preferencia) => {
    const restaurantes = restaurantesDelPerfil(perfil)
    const restauranteId = elegirRestaurante(restaurantes, preferencia)
    if (restauranteId) localStorage.setItem(RESTAURANTE_KEY, restauranteId)
    set({ perfil, restaurantes, restauranteId })
  },

  setRestaurante: (id) => {
    localStorage.setItem(RESTAURANTE_KEY, id)
    set({ restauranteId: id })
  },
}))

export function useRestauranteId(): string | null {
  return useContextoStore((s) => s.restauranteId)
}

export function useRestauranteActual(): RestauranteDeStaff | null {
  const restaurantes = useContextoStore((s) => s.restaurantes)
  const restauranteId = useContextoStore((s) => s.restauranteId)
  return restaurantes.find((r) => r.id === restauranteId) ?? null
}

/** Los roles de la persona en el restaurante elegido, para la navegación y los guards de la interfaz. */
export function useRolesActuales(): Rol[] {
  const perfil = usePerfil()
  const restauranteId = useContextoStore((s) => s.restauranteId)
  return rolesEnElRestaurante(perfil, restauranteId)
}
