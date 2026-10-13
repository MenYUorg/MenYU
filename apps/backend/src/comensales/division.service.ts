import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ComensalesService } from './comensales.service'

export interface ParteComensal {
  comensalId: string
  nombre: string
  montoCentavos: number
  monto: number
}

export interface ItemHuerfano {
  pedidoItemId: string
  nombre: string
  montoCentavos: number
  monto: number
}

export interface HuerfanosResumen {
  items: ItemHuerfano[]
  totalCentavos: number
  total: number
}

export interface PorConsumoResult {
  partes: ParteComensal[]
  huerfanos: HuerfanosResumen
}

@Injectable()
export class DivisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comensalesService: ComensalesService,
  ) {}

  async calcularPorConsumo(
    sesionId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<PorConsumoResult> {
    const sesion = await client.sesionMesa.findUnique({
      where: { id: sesionId },
      select: { id: true },
    })
    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada')
    }

    const comensales = await this.comensalesService.listarComensales(sesionId, client)
    if (comensales.length === 0) {
      throw new BadRequestException('No hay comensales registrados en esta sesión')
    }

    const pedidoItems = await client.pedidoItem.findMany({
      where: { pedido: { sesionId, estado: { not: 'cancelado' } } },
      include: {
        item: { select: { nombre: true } },
        asignaciones: { orderBy: { createdAt: 'asc' }, include: { comensal: true } },
      },
    })

    const itemsEtiquetados = pedidoItems.filter((pi) => pi.asignaciones.length > 0)
    const itemsHuerfanos = pedidoItems.filter((pi) => pi.asignaciones.length === 0)

    const montosPorComensal = new Map<string, number>()
    for (const comensal of comensales) {
      montosPorComensal.set(comensal.id, 0)
    }

    for (const pedidoItem of itemsEtiquetados) {
      const valorTotalCentavos = Math.round(
        Number(pedidoItem.precioUnitario) *
          (pedidoItem.cantidadEditada ?? pedidoItem.cantidad) *
          100,
      )
      const cantidadAsignaciones = pedidoItem.asignaciones.length
      const parteBaseCentavos = Math.floor(valorTotalCentavos / cantidadAsignaciones)
      const resto = valorTotalCentavos - parteBaseCentavos * cantidadAsignaciones

      pedidoItem.asignaciones.forEach((asignacion, index) => {
        const monto = parteBaseCentavos + (index === 0 ? resto : 0)
        montosPorComensal.set(
          asignacion.comensalId,
          (montosPorComensal.get(asignacion.comensalId) ?? 0) + monto,
        )
      })
    }

    const partes = comensales.map((comensal) => {
      const montoCentavos = montosPorComensal.get(comensal.id) ?? 0
      return {
        comensalId: comensal.id,
        nombre: comensal.nombre,
        montoCentavos,
        monto: montoCentavos / 100,
      }
    })

    const huerfanosItems: ItemHuerfano[] = itemsHuerfanos.map((pi) => {
      const montoCentavos = Math.round(
        Number(pi.precioUnitario) * (pi.cantidadEditada ?? pi.cantidad) * 100,
      )
      return {
        pedidoItemId: pi.id,
        nombre: pi.item.nombre,
        montoCentavos,
        monto: montoCentavos / 100,
      }
    })
    const huerfanosTotalCentavos = huerfanosItems.reduce((acc, i) => acc + i.montoCentavos, 0)

    return {
      partes,
      huerfanos: {
        items: huerfanosItems,
        totalCentavos: huerfanosTotalCentavos,
        total: huerfanosTotalCentavos / 100,
      },
    }
  }

  async obtenerSaldo(sesionId: string): Promise<{
    totalSesion: number
    totalCobrado: number
    saldoPendiente: number
  }> {
    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: sesionId } })
    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada')
    }

    const totalSesion = await this.calcularTotalSesion(this.prisma, sesionId)

    const pagosAprobados = await this.prisma.pago.findMany({
      where: { sesionId, estado: 'aprobado' },
    })
    const totalCobrado = pagosAprobados.reduce((acc, p) => acc + Number(p.monto), 0)

    return {
      totalSesion,
      totalCobrado,
      saldoPendiente: Math.max(0, totalSesion - totalCobrado),
    }
  }

  // Fórmula única del total de una sesión (excluye pedidos cancelados, respeta
  // cantidadEditada cuando el mozo corrigió una cantidad ya impresa). La consumen
  // tanto los cálculos de división de acá como PaymentsService — no duplicar.
  async calcularTotalSesion(client: Prisma.TransactionClient, sesionId: string): Promise<number> {
    const pedidos = await client.pedido.findMany({
      where: { sesionId, estado: { not: 'cancelado' } },
      include: {
        items: { select: { cantidad: true, cantidadEditada: true, precioUnitario: true } },
      },
    })
    return pedidos.reduce(
      (acc, p) =>
        acc +
        p.items.reduce((s, i) => s + Number(i.precioUnitario) * (i.cantidadEditada ?? i.cantidad), 0),
      0,
    )
  }

}
