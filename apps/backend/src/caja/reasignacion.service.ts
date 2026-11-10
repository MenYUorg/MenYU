import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { CAJA } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { PrismaService } from '../prisma/prisma.service'
import { exigirAsignacionesValidas } from './asignaciones-validas'
import { MENSAJE_TURNO_CERRADO, traducirConflictoDeReasignacion } from './conflictos'
import { ReasignarMesasDto } from './dto/reasignar-mesas.dto'
import { TURNO_SELECT, TurnoDeLaApi, turnoParaLaApi } from './turno.select'

/**
 * Reasignar las mesas de un turno abierto (#357): la lista del body reemplaza entera a la anterior, en una transacción
 * serializable. Quién reasigna no se guarda; el rol (el grupo CAJA del restaurante del turno) lo exige el service.
 */
@Injectable()
export class ReasignacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  async reasignar(turnoId: string, dto: ReasignarMesasDto, usuario: UsuarioAutenticado): Promise<{ turno: TurnoDeLaApi }> {
    const turno = await this.prisma.turno.findUnique({ where: { id: turnoId }, select: { restauranteId: true } })
    if (!turno) throw new NotFoundException('Turno no encontrado')
    await this.acceso.exigirRol(usuario.id, turno.restauranteId, CAJA)

    try {
      return await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const actual = await tx.turno.findUnique({ where: { id: turnoId }, select: { cerradoEn: true } })
          if (!actual) throw new NotFoundException('Turno no encontrado')
          if (actual.cerradoEn !== null) throw new ConflictException(MENSAJE_TURNO_CERRADO)

          const asignaciones = await exigirAsignacionesValidas(tx, turno.restauranteId, dto.asignaciones)
          await tx.asignacionTurno.deleteMany({ where: { turnoId } })
          if (asignaciones.length > 0) {
            await tx.asignacionTurno.createMany({ data: asignaciones.map((a) => ({ turnoId, ...a })) })
          }

          const leido = await tx.turno.findUniqueOrThrow({ where: { id: turnoId }, select: TURNO_SELECT })
          return { turno: turnoParaLaApi(leido) }
        },
        'reasignarMesas',
      )
    } catch (err) {
      throw traducirConflictoDeReasignacion(err)
    }
  }
}
