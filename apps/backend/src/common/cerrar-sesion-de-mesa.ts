import { Prisma } from '@prisma/client'
import { ESTADO_PAGO_CANCELADO, ESTADO_PAGO_PENDIENTE } from './estado-pago.constant'

/**
 * El único cierre de una sesión de mesa: lo usan el cobro en efectivo, el webhook de Mercado Pago, el cobro del salón y
 * el cierre a mano. Va dentro de la transacción del que llama.
 * - Cierra solo si la sesión sigue activa: el estado se mira al escribir, así un cobro tardío de una sesión ya cerrada no
 *   le pisa `cerradaEn` ni libera una mesa que puede tener otra sesión abierta.
 * - Cancela los pagos que sigan pendientes: con la sesión cerrada ya no se van a cobrar. El que la cubrió ya está aprobado.
 * - Libera la mesa solo si la cerró en este momento.
 * Devuelve `true` si la cerró y `false` si ya no estaba activa, sin tocar nada.
 */
export async function cerrarSesionDeMesa(
  tx: Prisma.TransactionClient,
  sesionId: string,
  mesaId: string,
  cerradaEn: Date,
): Promise<boolean> {
  const { count } = await tx.sesionMesa.updateMany({
    where: { id: sesionId, estado: 'activa' },
    data: { estado: 'cerrada', cerradaEn },
  })
  if (count === 0) return false

  await tx.pago.updateMany({
    where: { sesionId, estado: ESTADO_PAGO_PENDIENTE },
    data: { estado: ESTADO_PAGO_CANCELADO },
  })
  await tx.mesa.update({
    where: { id: mesaId },
    data: { estado: 'libre' },
  })
  return true
}
