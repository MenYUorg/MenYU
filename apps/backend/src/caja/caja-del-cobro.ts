import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { MENSAJE_ELEGIR_CAJA, MENSAJE_SIN_TURNO } from './conflictos'
import { MENSAJE_CAJA_NO_ABIERTA } from './movimientos.service'

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
    where: { cerradoEn: null, turno: { restauranteId, cerradoEn: null } },
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
