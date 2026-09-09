import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ESTADO_PAGO_APROBADO } from '../common/estado-pago.constant'
import { CrearComensalDto } from './dto/crear-comensal.dto'
import { EtiquetarItemDto } from './dto/etiquetar-item.dto'
import { ReclamarComensalDto } from './dto/reclamar-comensal.dto'
import { SetCantidadComensalesDto } from './dto/set-cantidad-comensales.dto'

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
    if (await this.sesionEstaCongelada(sesionId)) {
      throw new ConflictException(
        'La cuenta ya empezó a pagarse. Si ya estabas en la mesa, podés recuperar tu nombre con el PIN; si no, pedile al mozo que te cobre.',
      )
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

    const nombreNormalizado = dto.nombre.trim().toLowerCase()

    try {
      return await this.prisma.comensal.create({
        data: {
          sesionId,
          nombre: dto.nombre,
          nombreNormalizado,
          esOwner,
          creadoPorComensalId: dto.creadoPorComensalId ?? null,
        },
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe un comensal con ese nombre en esta sesión')
      }
      throw err
    }
  }

  async borrarComensal(sesionId: string, comensalId: string, solicitanteComensalId: string) {
    if (await this.sesionEstaCongelada(sesionId)) {
      throw new ConflictException('La sesión está congelada; no se pueden borrar comensales')
    }

    const comensal = await this.prisma.comensal.findUnique({ where: { id: comensalId } })
    if (!comensal || comensal.sesionId !== sesionId) {
      throw new NotFoundException('Comensal no encontrado en esta sesión')
    }
    await this.validarComensalEnSesion(sesionId, solicitanteComensalId)
    if (comensal.creadoPorComensalId === null) {
      throw new BadRequestException(
        'Este comensal se auto-registró y no puede borrarse desde acá',
      )
    }
    if (comensal.creadoPorComensalId !== solicitanteComensalId) {
      throw new ForbiddenException('Solo quien creó a este comensal puede borrarlo')
    }
    if (await this.comensalTienePagoAprobado(comensalId)) {
      throw new ConflictException('No se puede borrar un comensal con pago aprobado')
    }

    await this.prisma.$transaction([
      this.prisma.itemComensal.deleteMany({ where: { comensalId } }),
      this.prisma.comensal.delete({ where: { id: comensalId } }),
    ])

    return { id: comensalId }
  }

  async reclamarComensal(sesionId: string, dto: ReclamarComensalDto) {
    const sesion = await this.prisma.sesionMesa.findUnique({
      where: { id: sesionId },
      include: { mesa: { select: { pin: true } } },
    })
    const errorGenerico = new NotFoundException(
      'PIN incorrecto o el comensal no existe en esta sesión',
    )
    if (!sesion || sesion.estado !== 'activa' || dto.pin !== sesion.mesa.pin) {
      throw errorGenerico
    }

    const nombreNormalizado = dto.nombre.trim().toLowerCase()
    const comensal = await this.prisma.comensal.findUnique({
      where: { sesionId_nombreNormalizado: { sesionId, nombreNormalizado } },
    })
    if (!comensal) {
      throw errorGenerico
    }

    return {
      ...comensal,
      tienePagoAprobado: await this.comensalTienePagoAprobado(comensal.id),
    }
  }

  async listarComensales(sesionId: string) {
    return this.prisma.comensal.findMany({
      where: { sesionId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async setCantidadComensales(sesionId: string, dto: SetCantidadComensalesDto) {
    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: sesionId } })
    if (!sesion) {
      throw new NotFoundException('Sesión no encontrada')
    }
    if (await this.sesionEstaCongelada(sesionId)) {
      throw new ConflictException(
        'La sesión está congelada; no se puede modificar la cantidad de comensales',
      )
    }

    return this.prisma.sesionMesa.update({
      where: { id: sesionId },
      data: { cantidadComensales: dto.cantidadComensales },
      select: { id: true, cantidadComensales: true },
    })
  }

  async etiquetarItem(sesionId: string, dto: EtiquetarItemDto) {
    await this.validarComensalEnSesion(sesionId, dto.comensalId)
    await this.validarPedidoItemEnSesion(sesionId, dto.pedidoItemId)

    if (await this.sesionEstaCongelada(sesionId)) {
      const etiquetasExistentes = await this.prisma.itemComensal.count({
        where: { pedidoItemId: dto.pedidoItemId },
      })
      const esHuerfano = etiquetasExistentes === 0
      if (!esHuerfano) {
        throw new ConflictException(
          'La sesión está congelada; solo se pueden etiquetar ítems que no tengan ninguna etiqueta',
        )
      }
      if (await this.comensalTienePagoAprobado(dto.comensalId)) {
        throw new ConflictException(
          'No se puede etiquetar un ítem hacia un comensal con pago aprobado',
        )
      }
    }

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

    if (await this.sesionEstaCongelada(sesionId)) {
      throw new ConflictException('La sesión está congelada; no se pueden quitar etiquetas')
    }

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

  private async sesionEstaCongelada(sesionId: string): Promise<boolean> {
    const pagoAprobado = await this.prisma.pago.findFirst({
      where: { sesionId, estado: ESTADO_PAGO_APROBADO },
      select: { id: true },
    })
    return pagoAprobado !== null
  }

  private async comensalTienePagoAprobado(comensalId: string): Promise<boolean> {
    const pagoAprobado = await this.prisma.pago.findFirst({
      where: { comensalId, estado: ESTADO_PAGO_APROBADO },
      select: { id: true },
    })
    return pagoAprobado !== null
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
