import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { FilaDeArqueo, metodosDelArqueoParaLaApi } from './arqueo-para-la-api'
import { LIMITE_POR_DEFECTO, ListarTurnosDto } from './dto/listar-turnos.dto'

export const MENSAJE_CURSOR_INVALIDO = 'El cursor no es un turno de este restaurante'

/** Lo que se lee de cada turno del historial: quién lo abrió y lo cerró, y sus cajas por nombre. */
const TURNO_DEL_HISTORIAL_SELECT = {
  id: true,
  abiertoEn: true,
  cerradoEn: true,
  observaciones: true,
  abiertoPor: { select: { id: true, nombre: true } },
  cerradoPor: { select: { id: true, nombre: true } },
  cajas: {
    select: { id: true, cajaId: true, fondoInicial: true, caja: { select: { nombre: true } } },
    orderBy: { caja: { nombre: 'asc' } },
  },
} satisfies Prisma.TurnoSelect

type TurnoDelHistorial = Prisma.TurnoGetPayload<{ select: typeof TURNO_DEL_HISTORIAL_SELECT }>
type FilaDeArqueoDeCaja = FilaDeArqueo & { turnoCajaId: string }

/**
 * El historial de turnos de un restaurante (#357): del más nuevo al más viejo, paginado con cursor. Cada turno trae sus
 * cajas con el arqueo (null si el turno sigue abierto) y los totales de sus movimientos. El rol lo exige la ruta. Una
 * página son 3 consultas (4 con cursor), tenga los turnos que tenga: la validación del cursor, los turnos, los arqueos y
 * los totales de los movimientos.
 */
@Injectable()
export class HistorialService {
  constructor(private readonly prisma: PrismaService) {}

  async listar({ restauranteId, limite = LIMITE_POR_DEFECTO, cursor }: ListarTurnosDto) {
    if (cursor) {
      const delRestaurante = await this.prisma.turno.findFirst({ where: { id: cursor, restauranteId }, select: { id: true } })
      if (!delRestaurante) throw new BadRequestException(MENSAJE_CURSOR_INVALIDO)
    }

    // Uno de más para saber si hay otra página sin contar. El cursor es inclusivo: es el primero de la página.
    const filas = await this.prisma.turno.findMany({
      where: { restauranteId },
      orderBy: [{ abiertoEn: 'desc' }, { id: 'desc' }],
      take: limite + 1,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      select: TURNO_DEL_HISTORIAL_SELECT,
    })
    const turnos = filas.slice(0, limite)
    const aperturas = turnos.flatMap((t) => t.cajas.map((c) => c.id))

    const [arqueos, grupos] = await Promise.all([
      this.prisma.arqueoMetodo.findMany({
        where: { turnoCajaId: { in: aperturas } },
        select: { turnoCajaId: true, metodo: true, esperado: true, declarado: true, diferencia: true },
      }),
      this.prisma.movimientoCaja.groupBy({
        by: ['turnoCajaId', 'tipo'],
        where: { turnoCajaId: { in: aperturas } },
        _count: { _all: true },
        _sum: { monto: true },
      }),
    ])

    const totalesDe = (turnoCajaId: string) => {
      const deLaCaja = grupos.filter((g) => g.turnoCajaId === turnoCajaId)
      // `monto` es NOT NULL: un grupo que existe siempre tiene suma.
      const suma = (tipo: string) => deLaCaja.filter((g) => g.tipo === tipo).reduce((acc, g) => acc.plus(g._sum.monto as Prisma.Decimal), new Prisma.Decimal(0))
      return {
        cantidad: deLaCaja.reduce((acc, g) => acc + g._count._all, 0),
        ingresos: suma('INGRESO').toNumber(),
        egresos: suma('EGRESO').toNumber(),
      }
    }

    return {
      items: turnos.map((t) => turnoParaElHistorial(t, arqueos, totalesDe)),
      siguiente: filas.length > limite ? filas[limite].id : null,
    }
  }
}

/**
 * Un turno del historial como lo devuelve la API, con los montos como number. El arqueo de cada caja es null mientras el
 * turno está abierto; `movimientosDe` decide qué va en `movimientos` de cada caja (los totales, o la lista en el detalle).
 */
export function turnoParaElHistorial<M>(turno: TurnoDelHistorial, arqueos: FilaDeArqueoDeCaja[], movimientosDe: (turnoCajaId: string) => M) {
  return {
    id: turno.id,
    abiertoEn: turno.abiertoEn,
    abiertoPor: turno.abiertoPor,
    cerradoEn: turno.cerradoEn,
    cerradoPor: turno.cerradoPor,
    observaciones: turno.observaciones,
    cajas: turno.cajas.map((c) => ({
      id: c.id,
      cajaId: c.cajaId,
      nombre: c.caja.nombre,
      fondoInicial: c.fondoInicial.toNumber(),
      arqueo: turno.cerradoEn === null ? null : metodosDelArqueoParaLaApi(arqueos.filter((a) => a.turnoCajaId === c.id)),
      movimientos: movimientosDe(c.id),
    })),
  }
}
