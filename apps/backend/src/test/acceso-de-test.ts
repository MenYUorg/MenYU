import { Rol } from '@prisma/client'
import { AccesoService, MozoDelUsuario } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Las cuentas del personal de los tests y un AccesoService que responde con sus membresías, sin base. Lo
 * usan los tests de endpoints (`crearAppDeEndpoints`) y los de los services que piden permisos a
 * AccesoService: así los dos prueban la misma matriz con la lógica real de `exigirRol`.
 */

/** Marcas y restaurantes de los tests. Los ids son UUID porque varios DTOs lo exigen. */
export const MUNDO = {
  MARCA_A: '6f1c2a40-0000-4a1b-9c3d-00000000000a',
  MARCA_B: '6f1c2a40-0000-4a1b-9c3d-00000000000b',
  /** De la marca A, con su personal (GERENTE, JEFE_SALON, MOZO y COCINA). */
  REST_1: '6f1c2a40-1111-4a1b-9c3d-000000000001',
  /** De la marca A, sin personal propio: solo entra el OWNER de la marca. */
  REST_2: '6f1c2a40-1111-4a1b-9c3d-000000000002',
  /** De la marca B. */
  REST_B: '6f1c2a40-1111-4a1b-9c3d-0000000000b1',
} as const

/** La marca de cada restaurante. `restaurantesDe` los devuelve en este orden. */
const MARCA_DEL_RESTAURANTE: Record<string, string> = {
  [MUNDO.REST_1]: MUNDO.MARCA_A,
  [MUNDO.REST_2]: MUNDO.MARCA_A,
  [MUNDO.REST_B]: MUNDO.MARCA_B,
}

function cuenta(clave: string, numero: number, esRoot = false): UsuarioAutenticado {
  return {
    id: `usuario-${clave}`,
    supabaseUserId: `6f1c2a40-2222-4a1b-9c3d-${String(numero).padStart(12, '0')}`,
    email: `${clave}@menyu.test`,
    nombre: clave,
    esRoot,
  }
}

/** Cuentas con `Usuario` en la base (pasan SupabaseAuthGuard). Sus membresías, en `MEMBRESIAS`. */
export const CUENTAS = {
  /** Sin membresías: ROOT no es un bypass. */
  ROOT: cuenta('root', 1, true),
  OWNER_A: cuenta('owner-a', 2),
  OWNER_B: cuenta('owner-b', 3),
  GERENTE: cuenta('gerente', 4),
  JEFE_SALON: cuenta('jefe-salon', 5),
  MOZO: cuenta('mozo', 6),
  COCINA: cuenta('cocina', 7),
  /** Un `Usuario` activo sin ninguna membresía. */
  SIN_MEMBRESIAS: cuenta('sin-membresias', 8),
} as const

type Membresia = { rol: 'OWNER'; marcaId: string } | { rol: Exclude<Rol, 'OWNER'>; restauranteId: string }

const MEMBRESIAS: Record<string, Membresia[]> = {
  [CUENTAS.OWNER_A.id]: [{ rol: 'OWNER', marcaId: MUNDO.MARCA_A }],
  [CUENTAS.OWNER_B.id]: [{ rol: 'OWNER', marcaId: MUNDO.MARCA_B }],
  [CUENTAS.GERENTE.id]: [{ rol: 'GERENTE', restauranteId: MUNDO.REST_1 }],
  [CUENTAS.JEFE_SALON.id]: [{ rol: 'JEFE_SALON', restauranteId: MUNDO.REST_1 }],
  [CUENTAS.MOZO.id]: [{ rol: 'MOZO', restauranteId: MUNDO.REST_1 }],
  [CUENTAS.COCINA.id]: [{ rol: 'COCINA', restauranteId: MUNDO.REST_1 }],
}

/** El `Mozo` (perfil operativo) del MOZO y del JEFE_SALON en el restaurante 1. */
export const MOZOS = {
  DEL_MOZO: { id: '6f1c2a40-3333-4a1b-9c3d-000000000006', nombre: 'mozo', esJefeSalon: false },
  DEL_JEFE_SALON: { id: '6f1c2a40-3333-4a1b-9c3d-000000000005', nombre: 'jefe-salon', esJefeSalon: true },
} as const satisfies Record<string, MozoDelUsuario>

const MOZO_DEL_USUARIO: Record<string, { restauranteId: string; mozo: MozoDelUsuario }> = {
  [CUENTAS.MOZO.id]: { restauranteId: MUNDO.REST_1, mozo: MOZOS.DEL_MOZO },
  [CUENTAS.JEFE_SALON.id]: { restauranteId: MUNDO.REST_1, mozo: MOZOS.DEL_JEFE_SALON },
}

// Sin base: si un método que no se simula la usa, el error lo dice.
const sinBase = new Proxy(
  {},
  {
    get: (_destino, clave) => {
      throw new Error(`AccesoService de test sin base: usó prisma.${String(clave)}`)
    },
  },
) as PrismaService

/** AccesoService con las membresías de `CUENTAS`. Lo demás (exigirRol, exigirOwnerDeMarca, exigirAlgunRol) es el código real. */
class AccesoDeTest extends AccesoService {
  constructor() {
    super(sinBase)
  }

  override async rolesEnRestaurante(usuarioId: string, restauranteId: string): Promise<Rol[]> {
    const marcaId = MARCA_DEL_RESTAURANTE[restauranteId]
    if (!marcaId) return []
    return (MEMBRESIAS[usuarioId] ?? [])
      .filter((m) => ('restauranteId' in m ? m.restauranteId === restauranteId : m.marcaId === marcaId))
      .map((m) => m.rol)
  }

  override async esOwnerDeMarca(usuarioId: string, marcaId: string): Promise<boolean> {
    return (MEMBRESIAS[usuarioId] ?? []).some((m) => m.rol === 'OWNER' && m.marcaId === marcaId)
  }

  override async tieneAlgunRol(usuarioId: string, roles: readonly Rol[]): Promise<boolean> {
    return (MEMBRESIAS[usuarioId] ?? []).some((m) => roles.includes(m.rol))
  }

  override async mozoDe(usuarioId: string, restauranteId: string): Promise<MozoDelUsuario | null> {
    const suyo = MOZO_DEL_USUARIO[usuarioId]
    return suyo?.restauranteId === restauranteId ? suyo.mozo : null
  }

  override async restaurantesDe(usuarioId: string, roles: readonly Rol[] = Object.values(Rol)): Promise<string[]> {
    const restaurantes = Object.keys(MARCA_DEL_RESTAURANTE)
    const conRol = await Promise.all(
      restaurantes.map(async (id) => (await this.rolesEnRestaurante(usuarioId, id)).some((rol) => roles.includes(rol))),
    )
    return restaurantes.filter((_id, i) => conRol[i])
  }
}

/** Un AccesoService con las membresías de `CUENTAS` en `MUNDO`, sin base. */
export function accesoDeTest(): AccesoService {
  return new AccesoDeTest()
}
