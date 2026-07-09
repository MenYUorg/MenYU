import {
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'

export interface SesionResumen {
  sesionId: string
  mesaNumero: string
  estado: 'activa' | 'efectivo_solicitado' | 'mp_pendiente' | 'cerrada'
  total: number
  pedidos: { id: string; total: number; estado: string }[]
  pago?: { id: string; metodo: string; estado: string }
  cerradaEn?: string
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MenyuGateway,
  ) {}

  async getSesiones(restauranteId: string): Promise<SesionResumen[]> {
    const sesiones = await this.prisma.sesionMesa.findMany({
      where: { mesa: { restauranteId } },
      include: {
        mesa: { select: { numero: true } },
        pedidos: {
          include: {
            pago: true,
            items: true,
          },
        },
      },
      orderBy: { iniciadaEn: 'desc' },
      take: 100,
    })

    return sesiones.map((sesion) => {
      const total = sesion.pedidos.reduce(
        (acc, pedido) =>
          acc +
          pedido.items.reduce(
            (s, item) => s + Number(item.precioUnitario) * item.cantidad,
            0,
          ),
        0,
      )

      const pago = sesion.pedidos.flatMap((p) => (p.pago ? [p.pago] : []))[0]

      let estado: SesionResumen['estado']
      if (sesion.estado === 'cerrada') {
        estado = 'cerrada'
      } else if (pago && pago.estado === 'pendiente' && pago.metodo === 'mercadopago') {
        estado = 'mp_pendiente'
      } else if (pago && pago.metodo === 'efectivo') {
        estado = 'efectivo_solicitado'
      } else {
        estado = 'activa'
      }

      return {
        sesionId: sesion.id,
        mesaNumero: sesion.mesa.numero,
        estado,
        total,
        pedidos: sesion.pedidos.map((p) => ({
          id: p.id,
          total: p.items.reduce(
            (s, i) => s + Number(i.precioUnitario) * i.cantidad,
            0,
          ),
          estado: p.estado,
        })),
        pago: pago ? { id: pago.id, metodo: pago.metodo, estado: pago.estado } : undefined,
        cerradaEn: sesion.cerradaEn?.toISOString(),
      }
    })
  }

  async solicitarEfectivo(sesionId: string, pedidoId: string, monto: number) {
    const existing = await this.prisma.pago.findFirst({
      where: { pedidoId, metodo: 'efectivo' },
    })
    if (existing) {
      return { pagoId: existing.id, sesionId, estado: 'efectivo_solicitado' }
    }

    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: {
        mesa: { select: { id: true, numero: true, restauranteId: true } },
        pedidos: { include: { items: { select: { cantidad: true, precioUnitario: true } } } },
      },
    })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')

    const pago = await this.prisma.pago.create({
      data: {
        pedidoId,
        monto,
        metodo: 'efectivo',
        estado: 'pendiente',
      },
    })

    // Reemplazar cualquier llamado pendiente y crear uno con motivo pedir_cuenta
    await this.prisma.llamadoMozo.deleteMany({
      where: { sesionId, estado: 'pendiente' },
    })
    const llamado = await this.prisma.llamadoMozo.create({
      data: { sesionId, motivo: 'pedir_cuenta' },
    })

    const totalAcumulado = sesion.pedidos.reduce(
      (acc, p) => acc + p.items.reduce((s, i) => s + Number(i.precioUnitario) * i.cantidad, 0),
      0,
    )

    this.gateway.emitMozoCalled(sesion.mesa.restauranteId, {
      llamadoId: llamado.id,
      sesionId,
      mesaNumero: sesion.mesa.numero,
      motivo: 'pedir_cuenta',
    })

    this.gateway.emitQuierePagar(sesion.mesa.restauranteId, {
      sesionId,
      mesaId: sesion.mesa.id,
      mesaNumero: sesion.mesa.numero,
      totalAcumulado,
    })

    return { pagoId: pago.id, sesionId, estado: 'efectivo_solicitado' }
  }

  async confirmarEfectivo(sesionId: string, mozoId?: string) {
    const fechaCobro = new Date()

    const pedidoConEfectivo = await this.prisma.pedido.findFirst({
      where: { sesionId, pago: { metodo: 'efectivo' } },
      include: { pago: true },
      orderBy: { createdAt: 'desc' },
    })

    if (pedidoConEfectivo?.pago) {
      await this.prisma.$transaction([
        this.prisma.pago.update({
          where: { id: pedidoConEfectivo.pago.id },
          data: { estado: 'aprobado', fechaCobro, ...(mozoId ? { mozoId } : {}) },
        }),
        this.prisma.sesionMesa.update({
          where: { id: sesionId },
          data: { estado: 'cerrada', cerradaEn: fechaCobro },
        }),
      ])
      return { sesionId, estado: 'cerrada' }
    }

    // No hay registro de pago en efectivo — crear uno al confirmar
    const pedidos = await this.prisma.pedido.findMany({
      where: { sesionId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })

    const ultimo = pedidos[0]
    if (!ultimo) throw new NotFoundException('No se encontraron pedidos para esta sesión')

    const monto = pedidos.reduce(
      (acc, p) =>
        acc + p.items.reduce((s, i) => s + Number(i.precioUnitario) * i.cantidad, 0),
      0,
    )

    await this.prisma.$transaction(async (tx) => {
      await tx.pago.create({
        data: {
          pedidoId: ultimo.id,
          monto,
          metodo: 'efectivo',
          estado: 'aprobado',
          fechaCobro,
          ...(mozoId ? { mozoId } : {}),
        },
      })
      await tx.sesionMesa.update({
        where: { id: sesionId },
        data: { estado: 'cerrada', cerradaEn: fechaCobro },
      })
    })

    return { sesionId, estado: 'cerrada' }
  }
}
