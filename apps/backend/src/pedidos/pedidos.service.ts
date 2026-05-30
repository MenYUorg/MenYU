import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { Request } from 'express'
import { JwtPayload } from '../auth/auth.service'
import { CreatePedidoDto } from './dto/create-pedido.dto'
import { UpdateEstadoPedidoDto } from './dto/update-estado-pedido.dto'
import { EditPedidoDto } from './dto/edit-pedido.dto'

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

  async crearStaff(dto: CreatePedidoDto, user: JwtPayload) {
    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: dto.sesionId } })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')
    if (sesion.estado !== 'activa') throw new BadRequestException('La sesión no está activa')

    const mesa = await this.prisma.mesa.findUnique({ where: { id: dto.mesaId } })
    if (!mesa) throw new NotFoundException('Mesa no encontrada')

    await this.assertStaffAccess(mesa.restauranteId, user)

    const { restauranteId } = mesa

    const pedido = await this.prisma.$transaction(async (tx) => {
      const itemsData: Array<{
        itemId: string
        clienteId: null
        cantidad: number
        precioUnitario: number
        notas: string | null
        mods: Array<{ itemIngredienteId: string; accion: string; cantidad: number }>
      }> = []

      for (const itemDto of dto.items) {
        const dbItem = await tx.itemMenu.findFirst({
          where: { id: itemDto.itemId, restauranteId },
        })
        if (!dbItem) throw new NotFoundException(`Ítem ${itemDto.itemId} no encontrado en este restaurante`)

        let precioUnitario = Number(dbItem.precioBase)
        const modsData: Array<{ itemIngredienteId: string; accion: string; cantidad: number }> = []

        for (const mod of itemDto.mods ?? []) {
          const itemIngrediente = await tx.itemIngrediente.findUnique({
            where: { id: mod.itemIngredienteId },
          })
          if (!itemIngrediente) throw new NotFoundException(`ItemIngrediente ${mod.itemIngredienteId} no encontrado`)
          if (itemIngrediente.itemId !== itemDto.itemId) throw new BadRequestException('Modificador no pertenece al ítem')
          if (mod.accion === 'AGREGAR' && !itemIngrediente.esAgregable) {
            throw new BadRequestException(`El ingrediente ${mod.itemIngredienteId} no es agregable`)
          }
          if (mod.accion === 'QUITAR' && !itemIngrediente.esRemovible) {
            throw new BadRequestException(`El ingrediente ${mod.itemIngredienteId} no es removible`)
          }
          if (mod.accion === 'AGREGAR') {
            precioUnitario += Number(itemIngrediente.precioExtra) * mod.cantidad
          }
          modsData.push({ itemIngredienteId: mod.itemIngredienteId, accion: mod.accion, cantidad: mod.cantidad })
        }

        itemsData.push({
          itemId: itemDto.itemId,
          clienteId: null,
          cantidad: itemDto.cantidad,
          precioUnitario,
          notas: itemDto.notas ?? null,
          mods: modsData,
        })
      }

      return tx.pedido.create({
        data: {
          sesionId: dto.sesionId,
          mesaId: dto.mesaId,
          estado: 'en_preparacion',
          items: {
            create: itemsData.map((item) => ({
              itemId: item.itemId,
              clienteId: item.clienteId,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              notas: item.notas,
              mods: { create: item.mods },
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

  private async assertStaffAccess(restauranteId: string, user: JwtPayload): Promise<void> {
    if (user.tipo === 'mozo') {
      if (user.restauranteId !== restauranteId) {
        throw new ForbiddenException('No tenés acceso a este restaurante')
      }
      return
    }
    if (user.rol === 'ROOT') return
    if (user.rol === 'OWNER') {
      const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
      const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId } })
      if (!admin || !restaurante || admin.marcaId !== restaurante.marcaId) {
        throw new ForbiddenException('No tenés acceso a este restaurante')
      }
      return
    }
    if (user.rol === 'GERENTE') {
      const asignacion = await this.prisma.adminRestaurante.findUnique({
        where: { adminId_restauranteId: { adminId: user.sub, restauranteId } },
      })
      if (!asignacion) throw new ForbiddenException('No tenés acceso a este restaurante')
      return
    }
    throw new ForbiddenException('No tenés acceso a este restaurante')
  }

  async listarPorEstado(restauranteId: string, estado: string) {
    return this.prisma.pedido.findMany({
      where: { mesa: { restauranteId }, estado },
      include: {
        mesa: { select: { numero: true } },
        pago: { select: { estado: true } },
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

  async editarPedido(id: string, dto: EditPedidoDto, req: Request) {
    const user = req.user as { sub: string; tipo: string; rol?: string }

    if (user.tipo === 'cliente') throw new UnauthorizedException('Sin permiso para editar pedidos')
    if (user.tipo === 'admin' && !['GERENTE', 'ROOT'].includes(user.rol ?? '')) {
      throw new ForbiddenException('Rol insuficiente — se requiere GERENTE o ROOT')
    }

    // 1. Buscar pedido
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: { items: { include: { item: { select: { nombre: true } } } } },
    })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')
    if (pedido.estado === 'anulado') {
      throw new BadRequestException('No se puede editar un pedido anulado')
    }

    // 2. Verificar pago aprobado
    const pagoAprobado = await this.prisma.pago.findFirst({
      where: { pedidoId: id, estado: 'aprobado' },
    })
    if (pagoAprobado) throw new BadRequestException('Este pedido ya fue pagado')

    // 3. Validar justificación
    const trimmed = dto.justificacion.trim()
    if (!trimmed) throw new BadRequestException('La justificación es requerida')
    if (trimmed.split(/\s+/).length > 50) {
      throw new BadRequestException('La justificación no puede superar 50 palabras')
    }

    // 4. Validar que todos los pedidoItemId pertenecen al pedido
    const itemMap = new Map(pedido.items.map((i) => [i.id, i]))
    for (const ed of dto.ediciones) {
      if (!itemMap.has(ed.pedidoItemId)) {
        throw new BadRequestException(`El ítem ${ed.pedidoItemId} no pertenece a este pedido`)
      }
    }

    // 5. Validar cantidadNueva < cantidadActual para cada ítem editado
    for (const ed of dto.ediciones) {
      const item = itemMap.get(ed.pedidoItemId)!
      const cantidadActual = item.cantidadEditada ?? item.cantidad
      if (ed.cantidadNueva >= cantidadActual) {
        throw new BadRequestException(
          `cantidadNueva debe ser menor a la cantidad actual del ítem (${cantidadActual})`,
        )
      }
    }

    // 6. Ejecutar en transaction
    await this.prisma.$transaction(async (tx) => {
      for (const ed of dto.ediciones) {
        await tx.pedidoItem.update({
          where: { id: ed.pedidoItemId },
          data: { cantidadEditada: ed.cantidadNueva },
        })
      }

      const todosAnulados =
        dto.ediciones.every((e) => e.cantidadNueva === 0) &&
        pedido.items.every((item) => dto.ediciones.some((e) => e.pedidoItemId === item.id))

      if (todosAnulados) {
        await tx.pedido.update({ where: { id }, data: { estado: 'anulado' } })
      }

      await tx.pedidoEdicion.create({
        data: {
          pedidoId: id,
          adminId: user.tipo === 'admin' ? user.sub : null,
          mozoId: user.tipo === 'mozo' ? user.sub : null,
          justificacion: trimmed,
          itemsEliminados: {
            create: dto.ediciones.map((ed) => {
              const item = itemMap.get(ed.pedidoItemId)!
              return {
                pedidoItemId: ed.pedidoItemId,
                itemNombre: item.item.nombre,
                cantidadAntes: item.cantidadEditada ?? item.cantidad,
                cantidadDespues: ed.cantidadNueva,
                precioUnitario: item.precioUnitario,
              }
            }),
          },
        },
      })
    })

    return this.getPedidoConEdiciones(id)
  }

  async getEdiciones(id: string, req: Request) {
    const user = req.user as { tipo: string }
    if (user.tipo !== 'admin') {
      throw new ForbiddenException('Solo administradores pueden ver el historial de ediciones')
    }

    const pedido = await this.prisma.pedido.findUnique({ where: { id } })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')

    const ediciones = await this.prisma.pedidoEdicion.findMany({
      where: { pedidoId: id },
      include: {
        admin: { select: { email: true } },
        mozo: { select: { nombre: true } },
        itemsEliminados: true,
      },
      orderBy: { creadoEn: 'desc' },
    })

    return ediciones.map((e) => this.formatEdicion(e))
  }

  private async getPedidoConEdiciones(pedidoId: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
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
        ediciones: {
          include: {
            admin: { select: { email: true } },
            mozo: { select: { nombre: true } },
            itemsEliminados: true,
          },
          orderBy: { creadoEn: 'desc' },
        },
      },
    })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')

    return {
      ...pedido,
      ediciones: pedido.ediciones.map((e) => this.formatEdicion(e)),
    }
  }

  private formatEdicion(e: {
    id: string
    justificacion: string
    creadoEn: Date
    adminId: string | null
    mozoId: string | null
    admin: { email: string } | null
    mozo: { nombre: string } | null
    itemsEliminados: {
      id: string
      pedidoItemId: string
      itemNombre: string
      cantidadAntes: number
      cantidadDespues: number
      precioUnitario: unknown
    }[]
  }) {
    return {
      id: e.id,
      justificacion: e.justificacion,
      creadoEn: e.creadoEn,
      editor: {
        nombre: e.admin?.email ?? e.mozo?.nombre ?? 'Desconocido',
        tipo: e.adminId ? ('gerente' as const) : ('mozo' as const),
      },
      itemsEliminados: e.itemsEliminados.map((ei) => ({
        id: ei.id,
        itemNombre: ei.itemNombre,
        cantidadAntes: ei.cantidadAntes,
        cantidadDespues: ei.cantidadDespues,
        precioUnitario: Number(ei.precioUnitario),
      })),
    }
  }
}
