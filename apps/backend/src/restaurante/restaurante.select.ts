import { Prisma } from '@prisma/client'

/**
 * Las columnas de un restaurante que ve su personal. Nunca las de Mercado Pago (`mp_*`): guardan los tokens de la
 * cuenta conectada, cifrados, y solo los usa el backend.
 */
export const RESTAURANTE_SELECT = {
  id: true,
  marcaId: true,
  nombre: true,
  direccion: true,
  logoUrl: true,
  modoSesion: true,
  activo: true,
  createdAt: true,
  nombreSeccionRecomendados: true,
} satisfies Prisma.RestauranteSelect
