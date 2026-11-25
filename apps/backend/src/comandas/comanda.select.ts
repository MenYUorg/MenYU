import { Prisma } from '@prisma/client'

/** Lo que se ve de una comanda. */
export const COMANDA_SELECT = {
  id: true,
  restauranteId: true,
  nombre: true,
  activa: true,
} satisfies Prisma.ComandaSelect
