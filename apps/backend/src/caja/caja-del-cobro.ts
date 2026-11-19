import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MENSAJE_ELEGIR_CAJA, MENSAJE_SIN_TURNO } from './conflictos'
import { MENSAJE_CAJA_NO_ABIERTA } from './movimientos.service'

/** Las `TurnoCaja` abiertas del turno abierto del restaurante: donde puede entrar un pago (#358). */
export function aperturasAbiertas(restauranteId: string): Prisma.TurnoCajaWhereInput {
  return { cerradoEn: null, turno: { restauranteId, cerradoEn: null } }
}

/**
 * La caja a la que va un cobro (#358): el id de una `TurnoCaja` abierta del turno abierto del restaurante. Se llama con
 * el `tx` de la transacción serializable del cobro, antes de escribir el pago: así un cierre del turno al mismo tiempo
 * choca con el cobro (P2034) en lugar de dejar un pago aprobado fuera del arqueo.
 * - Sin turno abierto (o sin cajas abiertas en él): 400.
 * - Con `cajaId`, tiene que ser una de esas cajas (400 si no: de otro restaurante, cerrada o de otro turno).
 * - Sin `cajaId`: la única caja abierta; con dos o más, 400.
 */
export async function cajaDelCobro(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  cajaId: string | null | undefined,
): Promise<string> {
  const abiertas = await tx.turnoCaja.findMany({
    where: aperturasAbiertas(restauranteId),
    select: { id: true, cajaId: true },
  })
  if (abiertas.length === 0) throw new BadRequestException(MENSAJE_SIN_TURNO)

  if (cajaId) {
    const elegida = abiertas.find((a) => a.cajaId === cajaId)
    if (!elegida) throw new BadRequestException(MENSAJE_CAJA_NO_ABIERTA)
    return elegida.id
  }
  const [unica, ...otras] = abiertas
  if (otras.length > 0) throw new BadRequestException(MENSAJE_ELEGIR_CAJA)
  return unica.id
}

/**
 * La caja a la que va un pago de Mercado Pago del comensal (#358), que no elige caja: la abierta de `Caja.createdAt` más
 * antigua y, si empatan, la de menor `Caja.id`. No por `TurnoCaja.abiertoEn`: las cajas de un turno se abren en la misma
 * transacción y empatan siempre. Devuelve el id de la `TurnoCaja`, o null sin turno abierto (no lanza: la preferencia
 * responde 400 y el webhook aprueba sin caja). Se llama con el `tx` de la transacción serializable, como cajaDelCobro.
 */
export async function cajaDeMercadoPago(tx: Prisma.TransactionClient, restauranteId: string): Promise<string | null> {
  const apertura = await tx.turnoCaja.findFirst({
    where: aperturasAbiertas(restauranteId),
    orderBy: [{ caja: { createdAt: 'asc' } }, { caja: { id: 'asc' } }],
    select: { id: true },
  })
  return apertura?.id ?? null
}
