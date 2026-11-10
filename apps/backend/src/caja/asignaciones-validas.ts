import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AsignacionDeMesaDto } from './dto/abrir-turno.dto'

/**
 * Las asignaciones del body, si todas valen: cada mesa es del restaurante y está activa, y cada mozo es del restaurante,
 * está activo y tiene cuenta. Si no, 400. Las mesas repetidas ya las rechaza el DTO. La usan la apertura y la
 * reasignación, dentro de su transacción.
 */
export async function exigirAsignacionesValidas(
  tx: Prisma.TransactionClient,
  restauranteId: string,
  asignaciones: AsignacionDeMesaDto[],
): Promise<AsignacionDeMesaDto[]> {
  if (asignaciones.length === 0) return []

  const mesaIds = asignaciones.map((a) => a.mesaId)
  const mesas = await tx.mesa.findMany({
    where: { id: { in: mesaIds }, restauranteId },
    select: { id: true, numero: true, activo: true },
  })
  if (mesas.length !== mesaIds.length) throw new BadRequestException('Alguna de las mesas no existe o no es de este restaurante')
  const mesaDeBaja = mesas.find((m) => !m.activo)
  if (mesaDeBaja) throw new BadRequestException(`La mesa ${mesaDeBaja.numero} está dada de baja`)

  const mozoIds = [...new Set(asignaciones.map((a) => a.mozoId))]
  const mozos = await tx.mozo.findMany({
    where: { id: { in: mozoIds }, restauranteId },
    select: { id: true, nombre: true, activo: true, usuarioId: true },
  })
  if (mozos.length !== mozoIds.length) throw new BadRequestException('Alguno de los mozos no existe o no es de este restaurante')
  const mozoDeBaja = mozos.find((m) => !m.activo)
  if (mozoDeBaja) throw new BadRequestException(`El mozo «${mozoDeBaja.nombre}» está dado de baja`)
  const sinCuenta = mozos.find((m) => m.usuarioId === null)
  if (sinCuenta) throw new BadRequestException(`El mozo «${sinCuenta.nombre}» no tiene cuenta: no se le pueden asignar mesas`)

  return asignaciones.map(({ mesaId, mozoId }) => ({ mesaId, mozoId }))
}
