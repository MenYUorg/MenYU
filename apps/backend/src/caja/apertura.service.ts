import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { PrismaService } from '../prisma/prisma.service'
import { MENSAJE_TURNO_ABIERTO, traducirConflictoDeApertura } from './conflictos'
import { exigirAsignacionesValidas } from './asignaciones-validas'
import { AbrirTurnoDto } from './dto/abrir-turno.dto'
import { AvisoDePrecarga, precargarAsignaciones } from './precarga-de-asignaciones'
import { TURNO_SELECT, TurnoDeLaApi, turnoParaLaApi } from './turno.select'

export interface AperturaDeTurno {
  turno: TurnoDeLaApi
  avisos: AvisoDePrecarga[]
}

/**
 * Abrir un turno (#357): un solo turno abierto por restaurante, con 1 o 2 cajas y las mesas asignadas a cada mozo. El rol
 * en el restaurante del body lo exige la ruta. Todo se valida dentro de una transacción serializable; los índices únicos
 * parciales de #355 son la última defensa ante dos aperturas a la vez.
 */
@Injectable()
export class AperturaService {
  constructor(private readonly prisma: PrismaService) {}

  async abrir(dto: AbrirTurnoDto, usuario: UsuarioAutenticado): Promise<AperturaDeTurno> {
    const { restauranteId } = dto
    try {
      return await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const abierto = await tx.turno.findFirst({ where: { restauranteId, cerradoEn: null }, select: { id: true } })
          if (abierto) throw new ConflictException(MENSAJE_TURNO_ABIERTO)

          await exigirCajasAbribles(tx, restauranteId, dto.cajas.map((c) => c.cajaId))
          const { asignaciones, avisos } =
            dto.asignaciones === undefined
              ? await precargar(tx, restauranteId)
              : { asignaciones: await exigirAsignacionesValidas(tx, restauranteId, dto.asignaciones), avisos: [] }

          const { id } = await tx.turno.create({
            data: { restauranteId, abiertoPorUsuarioId: usuario.id, observaciones: dto.observaciones ?? null },
            select: { id: true },
          })
          // Una por una (son 1 o 2): así el P2002 del índice parcial llega con el modelo TurnoCaja, como lo prueba el e2e.
          for (const caja of dto.cajas) {
            await tx.turnoCaja.create({
              data: { turnoId: id, cajaId: caja.cajaId, fondoInicial: new Prisma.Decimal(caja.fondoInicial) },
              select: { id: true },
            })
          }
          if (asignaciones.length > 0) {
            await tx.asignacionTurno.createMany({ data: asignaciones.map((a) => ({ turnoId: id, ...a })) })
          }

          const turno = await tx.turno.findUniqueOrThrow({ where: { id }, select: TURNO_SELECT })
          return { turno: turnoParaLaApi(turno), avisos }
        },
        'abrirTurno',
      )
    } catch (err) {
      throw traducirConflictoDeApertura(err)
    }
  }

  /** El turno abierto del restaurante, o null. El rol lo exige la ruta. */
  async actual(restauranteId: string): Promise<{ turno: TurnoDeLaApi | null }> {
    const turno = await this.prisma.turno.findFirst({ where: { restauranteId, cerradoEn: null }, select: TURNO_SELECT })
    return { turno: turno ? turnoParaLaApi(turno) : null }
  }
}

/** 400 si alguna caja no existe, es de otro restaurante o está inactiva. Las repetidas ya las rechaza el DTO. */
async function exigirCajasAbribles(tx: Prisma.TransactionClient, restauranteId: string, cajaIds: string[]) {
  const cajas = await tx.caja.findMany({
    where: { id: { in: cajaIds }, restauranteId },
    select: { id: true, nombre: true, activa: true },
  })
  if (cajas.length !== cajaIds.length) throw new BadRequestException('Alguna de las cajas no existe o no es de este restaurante')
  const inactiva = cajas.find((c) => !c.activa)
  if (inactiva) throw new BadRequestException(`La caja «${inactiva.nombre}» está inactiva`)
}

/** La precarga desde la plantilla de `MozoMesa` (precarga-de-asignaciones.ts). */
async function precargar(tx: Prisma.TransactionClient, restauranteId: string) {
  const mesas = await tx.mesa.findMany({
    where: { restauranteId },
    orderBy: { numero: 'asc' },
    select: {
      id: true,
      numero: true,
      activo: true,
      mozoMesas: { select: { mozo: { select: { id: true, activo: true, usuarioId: true } } } },
    },
  })
  return precargarAsignaciones(mesas)
}
