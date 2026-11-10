import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CAJA } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { PrismaService } from '../prisma/prisma.service'
import { MENSAJE_TURNO_CERRADO, traducirOperacionSimultanea } from './conflictos'
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto'

export const MENSAJE_CAJA_NO_ABIERTA = 'La caja no está abierta en este turno'

const MOVIMIENTO_SELECT = {
  id: true,
  tipo: true,
  monto: true,
  motivo: true,
  createdAt: true,
  usuario: { select: { id: true, nombre: true } },
  turnoCaja: { select: { cajaId: true, caja: { select: { nombre: true } } } },
} satisfies Prisma.MovimientoCajaSelect

/**
 * Los ingresos y egresos de efectivo de una caja abierta del turno (#357). Son inmutables: no hay edición ni borrado. El
 * rol (el grupo CAJA del restaurante del turno) lo exige el service; quién lo carga sale de la cuenta.
 */
@Injectable()
export class MovimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  async registrar(turnoId: string, dto: RegistrarMovimientoDto, usuario: UsuarioAutenticado) {
    const turno = await this.prisma.turno.findUnique({ where: { id: turnoId }, select: { restauranteId: true } })
    if (!turno) throw new NotFoundException('Turno no encontrado')
    await this.acceso.exigirRol(usuario.id, turno.restauranteId, CAJA)

    try {
      const movimiento = await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          // El turno existe (es Restrict: no se borra con cajas); se relee para ver si se cerró.
          const actual = await tx.turno.findUniqueOrThrow({ where: { id: turnoId }, select: { cerradoEn: true } })
          if (actual.cerradoEn !== null) throw new ConflictException(MENSAJE_TURNO_CERRADO)

          const apertura = await tx.turnoCaja.findFirst({ where: { turnoId, cajaId: dto.cajaId }, select: { id: true } })
          if (!apertura) throw new BadRequestException(MENSAJE_CAJA_NO_ABIERTA)

          return tx.movimientoCaja.create({
            data: {
              turnoCajaId: apertura.id,
              tipo: dto.tipo,
              monto: new Prisma.Decimal(dto.monto),
              motivo: dto.motivo,
              usuarioId: usuario.id,
            },
            select: MOVIMIENTO_SELECT,
          })
        },
        'registrarMovimiento',
      )
      return { movimiento: movimientoParaLaApi(movimiento) }
    } catch (err) {
      throw traducirOperacionSimultanea(err)
    }
  }
}

function movimientoParaLaApi(m: Prisma.MovimientoCajaGetPayload<{ select: typeof MOVIMIENTO_SELECT }>) {
  return {
    id: m.id,
    cajaId: m.turnoCaja.cajaId,
    cajaNombre: m.turnoCaja.caja.nombre,
    tipo: m.tipo,
    monto: m.monto.toNumber(),
    motivo: m.motivo,
    usuario: m.usuario,
    createdAt: m.createdAt,
  }
}
