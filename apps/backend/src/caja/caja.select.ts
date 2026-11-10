import { Prisma } from '@prisma/client'

/** Lo que se ve de una caja. */
export const CAJA_SELECT = {
  id: true,
  restauranteId: true,
  nombre: true,
  activa: true,
  createdAt: true,
} satisfies Prisma.CajaSelect
