import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { CreateOrderDto } from './dto/create-order.dto'

interface SessionJwt {
  sub: string
  tipo: string
  sesionId: string
  mesaId: string
  restauranteId: string
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly gateway: MenyuGateway,
  ) {}

  async create(authHeader: string | undefined, dto: CreateOrderDto) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Session JWT requerido')
    }

    let payload: SessionJwt
    try {
      payload = this.jwt.verify<SessionJwt>(authHeader.slice(7))
    } catch {
      throw new UnauthorizedException('Session JWT inválido o expirado')
    }

    if (payload.tipo !== 'cliente') {
      throw new UnauthorizedException('Solo clientes pueden crear pedidos')
    }

    const { sesionId, mesaId, restauranteId, sub: clienteId } = payload

    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: sesionId } })
    if (!sesion || sesion.estado !== 'activa') {
      throw new BadRequestException('Sesión no activa')
    }

    const itemIds = dto.items.map((i) => i.itemMenuId)
    const dbItems = await this.prisma.itemMenu.findMany({
      where: { id: { in: itemIds }, restauranteId },
      include: { ingredientes: true },
    })

    if (dbItems.length !== new Set(itemIds).size) {
      throw new NotFoundException('Uno o más ítems no encontrados en este restaurante')
    }

    const dbMap = new Map(dbItems.map((i) => [i.id, i]))

    const pedido = await this.prisma.$transaction(async (tx) => {
      const created = await tx.pedido.create({
        data: {
          sesionId,
          mesaId,
          estado: 'pendiente',
          items: {
            create: dto.items.map((item) => {
              const dbItem = dbMap.get(item.itemMenuId)!

              let precioUnitario = Number(dbItem.precioBase)
              for (const mod of item.modificaciones) {
                if (mod.accion === 'agregar') {
                  const ing = dbItem.ingredientes.find((ii) => ii.id === mod.itemIngredienteId)
                  if (ing) precioUnitario += Number(ing.precioExtra) * mod.cantidad
                }
              }

              return {
                itemId: item.itemMenuId,
                clienteId,
                cantidad: item.cantidad,
                precioUnitario,
                notas: item.nota ?? null,
                mods: {
                  create: item.modificaciones.map((mod) => ({
                    itemIngredienteId: mod.itemIngredienteId,
                    accion: mod.accion,
                    cantidad: mod.cantidad,
                  })),
                },
              }
            }),
          },
        },
        include: { items: { include: { mods: true } } },
      })

      return created
    })

    this.gateway.emitOrderNew(restauranteId, pedido)

    return pedido
  }
}
