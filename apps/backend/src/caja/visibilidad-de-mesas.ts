import { Prisma, Rol } from '@prisma/client'
import { AccesoService } from '../auth/supabase/acceso.service'

/**
 * Qué mesas del salón ve una cuenta (#357): todas, o las sin asignar más las asignadas a su `Mozo` (`mozoId` null si no
 * tiene un perfil activo: solo las sin asignar).
 */
export type VisibilidadDeMesas = { tipo: 'todas' } | { tipo: 'del-mozo'; mozoId: string | null }

/** Los roles que ven todas las mesas. Cualquier otro (MOZO, o uno inesperado) se filtra. */
const ROLES_QUE_VEN_TODO: readonly Rol[] = ['OWNER', 'GERENTE', 'JEFE_SALON']

/**
 * Una asignación que cuenta: de un turno abierto y a un mozo activo. La de un mozo dado de baja deja la mesa sin
 * asignar, para que alguien con rol MOZO la pueda ver.
 */
export const ASIGNADA = { turno: { cerradoEn: null }, mozo: { activo: true } } satisfies Prisma.AsignacionTurnoWhereInput

/** Se decide por el rol de la membresía, nunca por `Mozo.esJefeSalon`. */
export function decidirVisibilidad(roles: readonly Rol[], mozo: { id: string } | null): VisibilidadDeMesas {
  if (roles.some((rol) => ROLES_QUE_VEN_TODO.includes(rol))) return { tipo: 'todas' }
  return { tipo: 'del-mozo', mozoId: mozo?.id ?? null }
}

/**
 * El filtro de `Mesa` que corresponde, para esparcir en un `where` de mesas (o en el `mesa` de uno de sesiones). Sin
 * turno abierto, o con un turno sin asignaciones, ninguna mesa está asignada y se ven todas.
 */
export function dondeMesaVisible(v: VisibilidadDeMesas): Prisma.MesaWhereInput {
  if (v.tipo === 'todas') return {}
  const sinAsignar: Prisma.MesaWhereInput = { asignacionesTurno: { none: ASIGNADA } }
  if (v.mozoId === null) return sinAsignar
  return { OR: [sinAsignar, { asignacionesTurno: { some: { turno: { cerradoEn: null }, mozoId: v.mozoId } } }] }
}

/** Pide los roles y, solo si hay que filtrar, el `Mozo` de la cuenta. */
export async function visibilidadDeMesas(acceso: AccesoService, usuarioId: string, restauranteId: string): Promise<VisibilidadDeMesas> {
  const roles = await acceso.rolesEnRestaurante(usuarioId, restauranteId)
  const visibilidad = decidirVisibilidad(roles, null)
  if (visibilidad.tipo === 'todas') return visibilidad
  return decidirVisibilidad(roles, await acceso.mozoDe(usuarioId, restauranteId))
}
