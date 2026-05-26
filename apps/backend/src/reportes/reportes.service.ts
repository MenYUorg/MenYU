import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

interface VentasPorHoraRow {
  hora: bigint
  total: string
}

interface VentasPorDiaRow {
  fecha: string
  total: string
  pedidos: number
}

interface TopItemRow {
  item_id: string
  nombre: string
  cantidad: bigint
  total: string
  categoria_id: string | null
  categoria_nombre: string | null
}

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  private parseRange(desde?: string, hasta?: string): { inicio: Date; fin: Date } {
    let inicio: Date
    let fin: Date
    if (desde) {
      inicio = new Date(desde + 'T00:00:00.000Z')
    } else {
      inicio = new Date()
      inicio.setHours(0, 0, 0, 0)
    }
    if (hasta) {
      fin = new Date(hasta + 'T23:59:59.999Z')
    } else {
      fin = new Date()
      fin.setHours(23, 59, 59, 999)
    }
    return { inicio, fin }
  }

  async ventasHoy(restauranteId: string, desde?: string, hasta?: string) {
    const { inicio, fin } = this.parseRange(desde, hasta)

    const [rows, cantidadSesiones] = await Promise.all([
      this.prisma.pedidoItem.findMany({
        where: {
          pedido: {
            createdAt: { gte: inicio, lte: fin },
            mesa: { restauranteId },
          },
        },
        select: {
          cantidad: true,
          precioUnitario: true,
          pedidoId: true,
        },
      }),
      this.prisma.sesionMesa.count({
        where: {
          cerradaEn: { gte: inicio, lte: fin },
          estado: 'cerrada',
          mesa: { restauranteId },
        },
      }),
    ])

    const total = rows.reduce((sum, r) => sum + Number(r.precioUnitario) * r.cantidad, 0)
    const cantidadPedidos = new Set(rows.map((r) => r.pedidoId)).size
    const ticketPromedio = cantidadPedidos === 0 ? 0 : total / cantidadPedidos

    return {
      total: Math.round(total * 100) / 100,
      cantidadPedidos,
      ticketPromedio: Math.round(ticketPromedio * 100) / 100,
      cantidadSesiones,
    }
  }

  async ventasPorHora(restauranteId: string, desde?: string, hasta?: string): Promise<{ hora: number; total: number }[]> {
    const { inicio, fin } = this.parseRange(desde, hasta)

    const rows = await this.prisma.$queryRaw<VentasPorHoraRow[]>`
      SELECT
        EXTRACT(HOUR FROM p.created_at)::int AS hora,
        SUM(pi.precio_unitario * pi.cantidad) AS total
      FROM pedido_item pi
      JOIN pedido p ON p.id = pi.pedido_id
      JOIN mesa m ON m.id = p.mesa_id
      WHERE m.restaurante_id = ${restauranteId}
        AND p.created_at >= ${inicio}
        AND p.created_at <= ${fin}
      GROUP BY hora
      ORDER BY hora
    `

    return rows.map((r) => ({
      hora: Number(r.hora),
      total: Math.round(Number(r.total) * 100) / 100,
    }))
  }

  async topItems(restauranteId: string, limit: number, desde?: string, hasta?: string): Promise<{ itemId: string; nombre: string; cantidad: number; total: number; categoriaId: string | null; categoriaNombre: string | null }[]> {
    const { inicio, fin } = this.parseRange(desde, hasta)

    const rows = await this.prisma.$queryRaw<TopItemRow[]>`
      SELECT
        pi.item_id,
        im.nombre,
        SUM(pi.cantidad)::int AS cantidad,
        SUM(pi.precio_unitario * pi.cantidad) AS total,
        im.categoria_id,
        cm.nombre AS categoria_nombre
      FROM pedido_item pi
      JOIN pedido p ON p.id = pi.pedido_id
      JOIN mesa m ON m.id = p.mesa_id
      JOIN item_menu im ON im.id = pi.item_id
      LEFT JOIN categoria_menu cm ON cm.id = im.categoria_id
      WHERE m.restaurante_id = ${restauranteId}
        AND p.created_at >= ${inicio}
        AND p.created_at <= ${fin}
      GROUP BY pi.item_id, im.nombre, im.categoria_id, cm.nombre
      ORDER BY cantidad DESC
      LIMIT ${limit}
    `

    return rows.map((r) => ({
      itemId: r.item_id,
      nombre: r.nombre,
      cantidad: Number(r.cantidad),
      total: Math.round(Number(r.total) * 100) / 100,
      categoriaId: r.categoria_id,
      categoriaNombre: r.categoria_nombre,
    }))
  }

  async ventasPorDia(restauranteId: string, desde?: string, hasta?: string): Promise<{ fecha: string; total: number; pedidos: number }[]> {
    const { inicio, fin } = this.parseRange(desde, hasta)

    const rows = await this.prisma.$queryRaw<VentasPorDiaRow[]>`
      SELECT
        TO_CHAR(DATE(p.created_at), 'YYYY-MM-DD') AS fecha,
        SUM(pi.precio_unitario * pi.cantidad) AS total,
        COUNT(DISTINCT p.id)::int AS pedidos
      FROM pedido p
      JOIN pedido_item pi ON pi.pedido_id = p.id
      JOIN mesa m ON m.id = p.mesa_id
      WHERE m.restaurante_id = ${restauranteId}
        AND p.created_at >= ${inicio}
        AND p.created_at <= ${fin}
      GROUP BY DATE(p.created_at)
      ORDER BY fecha ASC
    `

    return rows.map((r) => ({
      fecha: r.fecha,
      total: Math.round(Number(r.total) * 100) / 100,
      pedidos: Number(r.pedidos),
    }))
  }
}
