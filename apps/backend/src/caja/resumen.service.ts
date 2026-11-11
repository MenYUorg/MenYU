import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CAJA } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { ESTADO_PAGO_APROBADO } from '../common/estado-pago.constant'
import { PrismaService } from '../prisma/prisma.service'
import { Acumulado, resumenDeTurno } from './resumen-de-turno'

/**
 * El resumen de un turno (#357), abierto o cerrado: lo cobrado en sus cajas por método y por quién cobró, y aparte, como
 * informativo, los pagos de Mercado Pago aprobados en la franja del turno (que nunca van a una caja). No incluye el
 * esperado ni el arqueo. El rol (el grupo CAJA del restaurante del turno) lo exige el service antes de leer ningún pago.
 */
@Injectable()
export class ResumenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  async resumen(turnoId: string, usuario: UsuarioAutenticado) {
    // Un solo "ahora" para toda la consulta: es el final de la franja de un turno abierto.
    const ahora = new Date()
    const turno = await this.prisma.turno.findUnique({
      where: { id: turnoId },
      select: { id: true, restauranteId: true, abiertoEn: true, cerradoEn: true },
    })
    if (!turno) throw new NotFoundException('Turno no encontrado')
    await this.acceso.exigirRol(usuario.id, turno.restauranteId, CAJA)

    // Sin filtrar por estado ni por método: la regla de qué pagos cuentan vive en resumenDeTurno.
    const pagos = await this.prisma.pago.findMany({
      where: { turnoCaja: { turnoId } },
      select: { metodo: true, estado: true, monto: true, propina: true, mozoId: true, mozo: { select: { nombre: true } } },
    })
    const { porMetodo, porMozo, total } = resumenDeTurno({ pagos })
    // El nombre de cada mozo sale de los mismos pagos: ninguna consulta más.
    const nombres = new Map(pagos.map((p) => [p.mozoId, p.mozo?.nombre ?? null]))

    const desde = turno.abiertoEn
    const hasta = turno.cerradoEn ?? ahora
    const mercadoPago = await this.prisma.pago.findMany({
      where: {
        metodo: 'mercadopago',
        estado: ESTADO_PAGO_APROBADO,
        fechaCobro: { gte: desde, lte: hasta },
        sesion: { mesa: { restauranteId: turno.restauranteId } },
      },
      select: {
        id: true,
        monto: true,
        propina: true,
        fechaCobro: true,
        requiereRevision: true,
        sesion: { select: { mesa: { select: { numero: true } } } },
      },
      orderBy: { fechaCobro: 'asc' },
    })
    const totalMercadoPago = mercadoPago.reduce(
      (acc, p) => ({ monto: acc.monto.plus(p.monto), propina: acc.propina.plus(p.propina) }),
      { monto: new Prisma.Decimal(0), propina: new Prisma.Decimal(0) },
    )

    return {
      turno: { id: turno.id, abiertoEn: turno.abiertoEn, cerradoEn: turno.cerradoEn },
      porMetodo: porMetodo.map(({ metodo, ...acumulado }) => ({ metodo, ...comoNumeros(acumulado) })),
      porMozo: porMozo
        .map(({ mozoId, ...acumulado }) => ({ mozoId, mozoNombre: nombres.get(mozoId) ?? null, ...comoNumeros(acumulado) }))
        .sort(porNombreConLosSinMozoAlFinal),
      total: comoNumeros(total),
      mercadoPago: {
        desde,
        hasta,
        cantidad: mercadoPago.length,
        monto: totalMercadoPago.monto.toNumber(),
        propina: totalMercadoPago.propina.toNumber(),
        pagos: mercadoPago.map((p) => ({
          id: p.id,
          mesaNumero: p.sesion.mesa.numero,
          monto: p.monto.toNumber(),
          propina: p.propina.toNumber(),
          fechaCobro: p.fechaCobro,
          requiereRevision: p.requiereRevision,
        })),
      },
    }
  }
}

function comoNumeros({ cantidad, monto, propina }: Acumulado) {
  return { cantidad, monto: monto.toNumber(), propina: propina.toNumber() }
}

/** Por nombre del mozo; el grupo de los pagos sin mozo, al final. Con el mismo nombre, por id, para que el orden sea fijo. */
function porNombreConLosSinMozoAlFinal(
  a: { mozoId: string | null; mozoNombre: string | null },
  b: { mozoId: string | null; mozoNombre: string | null },
): number {
  if (a.mozoId === null || b.mozoId === null) return (a.mozoId === null ? 1 : 0) - (b.mozoId === null ? 1 : 0)
  return (a.mozoNombre ?? '').localeCompare(b.mozoNombre ?? '') || a.mozoId.localeCompare(b.mozoId)
}
