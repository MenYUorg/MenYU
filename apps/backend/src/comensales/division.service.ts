import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ComensalesService } from './comensales.service'

export interface ParteComensal {
  comensalId: string
  nombre: string
  montoCentavos: number
  monto: number
}

export interface PartesIgualesResult {
  divisionPagosHabilitada: boolean
  divisor: number
  partes: ParteComensal[]
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
  divisionPagosHabilitada: boolean
  divisor: number
  partes: ParteComensal[]
  huerfanos: HuerfanosResumen
}

@Injectable()
export class DivisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comensalesService: ComensalesService,
  ) {}

  async calcularPartesIguales(sesionId: string): Promise<PartesIgualesResult> {
    const sesion = await this.buscarSesionConRestaurante(sesionId)

    const comensales = await this.comensalesService.listarComensales(sesionId)
    if (comensales.length === 0) {
      throw new BadRequestException('No hay comensales registrados en esta sesión')
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
    const divisor = this.calcularDivisor(sesion.cantidadComensales, comensales.length)
    const parteBaseCentavos = Math.floor(totalCentavos / divisor)
    const resto = totalCentavos - parteBaseCentavos * divisor

    // No se usa esOwner acá: es una convención que setea el frontend al crear el primer
    // comensal, pero el slot de anfitrión se consume en sessions.open() antes de que
    // exista ningún Comensal, así que puede no cumplirse nunca en una sesión dada. El
    // resto de centavos cae en comensales[0], determinístico por createdAt asc.
    const partes = comensales.map((comensal, index) => {
      const montoCentavos = parteBaseCentavos + (index === 0 ? resto : 0)
      return {
        comensalId: comensal.id,
        nombre: comensal.nombre,
        montoCentavos,
        monto: montoCentavos / 100,
      }
    })

    return {
      divisionPagosHabilitada: sesion.mesa.restaurante.divisionPagosHabilitada,
      divisor,
      partes,
    }
  }

  async calcularPorConsumo(sesionId: string): Promise<PorConsumoResult> {
    const sesion = await this.buscarSesionConRestaurante(sesionId)

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
      divisionPagosHabilitada: sesion.mesa.restaurante.divisionPagosHabilitada,
      divisor: this.calcularDivisor(sesion.cantidadComensales, comensales.length),
      partes,
      huerfanos: {
        items: huerfanosItems,
        totalCentavos: huerfanosTotalCentavos,
        total: huerfanosTotalCentavos / 100,
      },
    }
  }

  async obtenerModoDivision(
    sesionId: string,
  ): Promise<{ modoDivision: 'partes_iguales' | 'por_consumo' | null }> {
    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: sesionId } })
    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada')
    }

    return { modoDivision: sesion.modoDivision as 'partes_iguales' | 'por_consumo' | null }
  }

  private calcularDivisor(cantidadComensales: number | null, comensalesRegistrados: number): number {
    return Math.max(cantidadComensales ?? 0, comensalesRegistrados)
  }

  private async buscarSesionConRestaurante(sesionId: string) {
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: { mesa: { include: { restaurante: { select: { divisionPagosHabilitada: true } } } } },
    })
    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada')
    }
    return sesion
  }
}
