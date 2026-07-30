import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CrearComensalDto } from './dto/crear-comensal.dto'
import { EtiquetarItemDto } from './dto/etiquetar-item.dto'

@Injectable()
export class ComensalesService {
  constructor(private readonly prisma: PrismaService) {}

  async crearComensal(sesionId: string, dto: CrearComensalDto) {
    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: sesionId } })
    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada')
    }
    if (sesion.estado !== 'activa') {
      throw new BadRequestException('La sesión no está activa')
    }

    const esOwner = dto.esOwner ?? false
    if (esOwner) {
      const ownerExistente = await this.prisma.comensal.findFirst({
        where: { sesionId, esOwner: true },
      })
      if (ownerExistente) {
        throw new BadRequestException('La sesión ya tiene un comensal owner')
      }
    }

    return this.prisma.comensal.create({
      data: { sesionId, nombre: dto.nombre, esOwner },
    })
  }

  async listarComensales(sesionId: string) {
    return this.prisma.comensal.findMany({
      where: { sesionId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async etiquetarItem(sesionId: string, dto: EtiquetarItemDto) {
    await this.validarComensalEnSesion(sesionId, dto.comensalId)
    await this.validarPedidoItemEnSesion(sesionId, dto.pedidoItemId)

    return this.prisma.itemComensal.upsert({
      where: {
        pedidoItemId_comensalId: {
          pedidoItemId: dto.pedidoItemId,
          comensalId: dto.comensalId,
        },
      },
      create: { pedidoItemId: dto.pedidoItemId, comensalId: dto.comensalId },
      update: {},
    })
  }

  async desetiquetarItem(sesionId: string, pedidoItemId: string, comensalId: string) {
    await this.validarComensalEnSesion(sesionId, comensalId)
    await this.validarPedidoItemEnSesion(sesionId, pedidoItemId)

    const asignacion = await this.prisma.itemComensal.findUnique({
      where: { pedidoItemId_comensalId: { pedidoItemId, comensalId } },
    })
    if (!asignacion) {
      throw new NotFoundException('La asignación no existe')
    }

    return this.prisma.itemComensal.delete({
      where: { pedidoItemId_comensalId: { pedidoItemId, comensalId } },
    })
  }

  async listarEtiquetasDeItem(sesionId: string, pedidoItemId: string) {
    await this.validarPedidoItemEnSesion(sesionId, pedidoItemId)

    return this.prisma.itemComensal.findMany({
      where: { pedidoItemId },
      include: { comensal: true },
    })
  }

  private async validarComensalEnSesion(sesionId: string, comensalId: string): Promise<void> {
    const comensal = await this.prisma.comensal.findUnique({ where: { id: comensalId } })
    if (!comensal || comensal.sesionId !== sesionId) {
      throw new NotFoundException('Comensal no encontrado en esta sesión')
    }
  }

  private async validarPedidoItemEnSesion(sesionId: string, pedidoItemId: string): Promise<void> {
    const pedidoItem = await this.prisma.pedidoItem.findUnique({
      where: { id: pedidoItemId },
      include: { pedido: { select: { sesionId: true } } },
    })
    if (!pedidoItem || pedidoItem.pedido.sesionId !== sesionId) {
      throw new NotFoundException('Ítem no encontrado en esta sesión')
    }
  }
}
