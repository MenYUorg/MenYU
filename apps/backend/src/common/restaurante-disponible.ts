import type { Prisma } from '@prisma/client'

/**
 * Un restaurante está disponible para el público si él Y su marca están activos (docs/plan-consola-root.md, sección 6).
 * Dar de baja una marca no le cambia el `activo` a sus restaurantes, que conservan su propio estado para poder reactivar la
 * marca sin tocar nada más: por eso se mira siempre la pareja.
 */
export const RESTAURANTE_DISPONIBLE = { activo: true, marca: { activo: true } } satisfies Prisma.RestauranteWhereInput

/** Lo que hay que traer de un restaurante para decidir con `restauranteDisponible`. */
export const SELECT_DISPONIBILIDAD = { activo: true, marca: { select: { activo: true } } } satisfies Prisma.RestauranteSelect

export function restauranteDisponible(restaurante: { activo: boolean; marca: { activo: boolean } }): boolean {
  return restaurante.activo && restaurante.marca.activo
}
