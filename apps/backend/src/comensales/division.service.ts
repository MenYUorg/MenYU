import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ComensalesService } from './comensales.service'

export interface ParteComensal {
  comensalId: string
  nombre: string
  montoCentavos: number
  monto: number
}

@Injectable()
export class DivisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comensalesService: ComensalesService,
  ) {}

  async calcularPartesIguales(sesionId: string): Promise<ParteComensal[]> {
    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: sesionId } })
    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada')
    }

    const comensales = await this.comensalesService.listarComensales(sesionId)
    if (comensales.length === 0) {
      throw new BadRequestException('No hay comensales registrados en esta sesión')
    }

    const owner = comensales.find((c) => c.esOwner)
    if (!owner) {
      throw new BadRequestException(
        'La sesión no tiene un comensal owner definido, no se puede calcular la división',
      )
    }

    const pedidos = await this.prisma.pedido.findMany({
      where: { sesionId, estado: { not: 'cancelado' } },
      include: { items: true },
    })

    const total = pedidos
      .flatMap((pedido) => pedido.items)
      .reduce(
        (acc, item) => acc + Number(item.precioUnitario) * (item.cantidadEditada ?? item.cantidad),
        0,
      )

    const totalCentavos = Math.round(total * 100)
    const cantidadComensales = comensales.length
    const parteBaseCentavos = Math.floor(totalCentavos / cantidadComensales)
    const resto = totalCentavos - parteBaseCentavos * cantidadComensales

    return comensales.map((comensal) => {
      const montoCentavos = parteBaseCentavos + (comensal.id === owner.id ? resto : 0)
      return {
        comensalId: comensal.id,
        nombre: comensal.nombre,
        montoCentavos,
        monto: montoCentavos / 100,
      }
    })
  }

  async calcularPorConsumo(sesionId: string): Promise<ParteComensal[]> {
    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: sesionId } })
    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada')
    }

    const comensales = await this.comensalesService.listarComensales(sesionId)
    if (comensales.length === 0) {
      throw new BadRequestException('No hay comensales registrados en esta sesión')
    }

    const pedidoItems = await this.prisma.pedidoItem.findMany({
      where: { pedido: { sesionId, estado: { not: 'cancelado' } } },
      include: {
        item: { select: { nombre: true } },
        asignaciones: { orderBy: { createdAt: 'asc' }, include: { comensal: true } },
      },
    })

    const itemsSinEtiquetar = pedidoItems.filter((pi) => pi.asignaciones.length === 0)
    if (itemsSinEtiquetar.length > 0) {
      throw new BadRequestException(
        `Los siguientes ítems no están etiquetados: ${itemsSinEtiquetar
          .map((pi) => pi.item.nombre)
          .join(', ')}`,
      )
    }

    const montosPorComensal = new Map<string, number>()
    for (const comensal of comensales) {
      montosPorComensal.set(comensal.id, 0)
    }

    for (const pedidoItem of pedidoItems) {
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

    return comensales.map((comensal) => {
      const montoCentavos = montosPorComensal.get(comensal.id) ?? 0
      return {
        comensalId: comensal.id,
        nombre: comensal.nombre,
        montoCentavos,
        monto: montoCentavos / 100,
      }
    })
  }
}
