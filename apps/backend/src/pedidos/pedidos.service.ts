import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { Request } from 'express'
import { CreatePedidoDto } from './dto/create-pedido.dto'
import { UpdateEstadoPedidoDto } from './dto/update-estado-pedido.dto'

interface SessionJwt {
  sub: string
  tipo: string
  sesionId: string
  mesaId: string
  restauranteId: string
}

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly gateway: MenyuGateway,
  ) {}

  async confirmar(authHeader: string | undefined, dto: CreatePedidoDto) {
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

    const { restauranteId, sub: clienteId } = payload

    const pedido = await this.prisma.$transaction(async (tx) => {
      // a. Verificar sesión activa
      const sesion = await tx.sesionMesa.findUnique({ where: { id: dto.sesionId } })
      if (!sesion) {
        throw new NotFoundException('Sesión no encontrada')
      }
      if (sesion.estado !== 'activa') {
        throw new BadRequestException('La sesión no está activa')
      }

      // b. Validar ítems y calcular precios
      const itemsData: Array<{
        itemId: string
        clienteId: string
        cantidad: number
        precioUnitario: number
        notas: string | null
        mods: Array<{ itemIngredienteId: string; accion: string; cantidad: number }>
      }> = []

      for (const itemDto of dto.items) {
        const dbItem = await tx.itemMenu.findFirst({
          where: { id: itemDto.itemId, restauranteId },
        })
        if (!dbItem) {
          throw new NotFoundException(`Ítem ${itemDto.itemId} no encontrado en este restaurante`)
        }

        let precioUnitario = Number(dbItem.precioBase)
        const modsData: Array<{ itemIngredienteId: string; accion: string; cantidad: number }> = []

        for (const mod of itemDto.mods ?? []) {
          const itemIngrediente = await tx.itemIngrediente.findUnique({
            where: { id: mod.itemIngredienteId },
          })
          if (!itemIngrediente) {
            throw new NotFoundException(`ItemIngrediente ${mod.itemIngredienteId} no encontrado`)
          }
          if (itemIngrediente.itemId !== itemDto.itemId) {
            throw new BadRequestException('Modificador no pertenece al ítem')
          }
          if (mod.accion === 'AGREGAR' && !itemIngrediente.esAgregable) {
            throw new BadRequestException(
              `El ingrediente ${mod.itemIngredienteId} no es agregable`,
            )
          }
          if (mod.accion === 'QUITAR' && !itemIngrediente.esRemovible) {
            throw new BadRequestException(
              `El ingrediente ${mod.itemIngredienteId} no es removible`,
            )
          }

          if (mod.accion === 'AGREGAR') {
            precioUnitario += Number(itemIngrediente.precioExtra) * mod.cantidad
          } else {
            precioUnitario -= Number(itemIngrediente.precioExtra) * mod.cantidad
          }

          modsData.push({
            itemIngredienteId: mod.itemIngredienteId,
            accion: mod.accion,
            cantidad: mod.cantidad,
          })
        }

        itemsData.push({
          itemId: itemDto.itemId,
          clienteId,
          cantidad: itemDto.cantidad,
          precioUnitario,
          notas: itemDto.notas ?? null,
          mods: modsData,
        })
      }

      // c. Crear pedido con items y mods en una sola operación
      return tx.pedido.create({
        data: {
          sesionId: dto.sesionId,
          mesaId: dto.mesaId,
          estado: 'pendiente',
          items: {
            create: itemsData.map((item) => ({
              itemId: item.itemId,
              clienteId: item.clienteId,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              notas: item.notas,
              mods: {
                create: item.mods,
              },
            })),
          },
        },
        include: {
          mesa: { select: { numero: true } },
          items: {
            include: {
              item: { select: { nombre: true } },
              mods: {
                include: {
                  itemIngrediente: {
                    include: { ingrediente: { select: { nombre: true } } },
                  },
                },
              },
            },
          },
        },
      })
    })

    this.gateway.emitOrderNew(restauranteId, pedido)

    return pedido
  }

  async listarPorEstado(restauranteId: string, estado: string) {
    return this.prisma.pedido.findMany({
      where: { mesa: { restauranteId }, estado },
      include: {
        mesa: { select: { numero: true } },
        items: {
          include: {
            item: { select: { nombre: true } },
            mods: {
              include: {
                itemIngrediente: {
                  include: { ingrediente: { select: { nombre: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async actualizarEstado(
    id: string,
    dto: UpdateEstadoPedidoDto,
    req: Request,
  ) {
    // JwtAuthGuard ya verificó el token — req.user tiene el payload
    const user = req.user as { tipo: string } | undefined
    if (user?.tipo === 'cliente') {
      throw new UnauthorizedException('Solo staff puede actualizar el estado de un pedido')
    }

    // a. Buscar pedido con mesa para obtener restauranteId
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: { mesa: true },
    })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')

    // b. Validar transición
    const TRANSICIONES: Record<string, string> = {
      pendiente: 'en_preparacion',
      en_preparacion: 'listo',
      listo: 'entregado',
    }
    if (TRANSICIONES[pedido.estado] !== dto.estado) {
      throw new BadRequestException(
        `Transición inválida: ${pedido.estado} → ${dto.estado}`,
      )
    }

    // c. Actualizar estado
    const actualizado = await this.prisma.pedido.update({
      where: { id },
      data: { estado: dto.estado },
      include: {
        mesa: { select: { numero: true } },
        items: {
          include: {
            item: { select: { nombre: true } },
            mods: {
              include: {
                itemIngrediente: {
                  include: { ingrediente: { select: { nombre: true } } },
                },
              },
            },
          },
        },
      },
    })

    // d. Emitir a cocina/mozo
    this.gateway.emitOrderUpdated(pedido.mesa.restauranteId, actualizado)

    return actualizado
  }
}
