import { PrismaService } from '../prisma/prisma.service'

/**
 * Mozos que reciben los eventos de una mesa.
 *
 * - Mesa con mozos asignados (mozo_mesa) y activos: solo ellos.
 * - Mesa sin mozo asignado, o cuyos mozos están todos dados de baja
 *   (mozos.remove hace activo=false y no borra mozo_mesa): todos los mozos
 *   activos del restaurante.
 *
 * Las asignaciones son fijas por turno. Este es el único punto que cambia
 * cuando lleguen los turnos (p. ej. filtrar por turno abierto).
 */
export async function destinatariosDeMesa(
  prisma: Pick<PrismaService, 'mesa' | 'mozo'>,
  mesaId: string,
): Promise<string[]> {
  const mesa = await prisma.mesa.findUnique({
    where: { id: mesaId },
    select: {
      restauranteId: true,
      mozoMesas: { where: { mozo: { activo: true } }, select: { mozoId: true } },
    },
  })
  if (!mesa) return []
  if (mesa.mozoMesas.length > 0) return mesa.mozoMesas.map((a) => a.mozoId)

  const mozos = await prisma.mozo.findMany({
    where: { restauranteId: mesa.restauranteId, activo: true },
    select: { id: true },
  })
  return mozos.map((m) => m.id)
}
