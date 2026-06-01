import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import * as QRCode from 'qrcode'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'
import { CreateMesaDto } from './dto/create-mesa.dto'
import { UpdateMesaDto } from './dto/update-mesa.dto'

@Injectable()
export class MesasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMesaDto) {
    const restaurante = await this.assertRestauranteAccess(dto.restauranteId)

    const existing = await this.prisma.mesa.findFirst({
      where: { restauranteId: dto.restauranteId, numero: dto.numero, activo: true },
    })
    if (existing) throw new ConflictException(`Ya existe una mesa con el número ${dto.numero}`)

    const qrToken = randomUUID()
    const pin = await this.generatePin(dto.restauranteId)
    const mesa = await this.prisma.mesa.create({
      data: { ...dto, qrToken, pin },
    })

    return { ...mesa, qrImage: await this.generateQr(qrToken, restaurante.qrBaseUrl, dto.restauranteId) }
  }

  async findAll(restauranteId: string, user: JwtPayload) {
    await this.assertRestauranteOwnership(restauranteId, user)

    const mesas = await this.prisma.mesa.findMany({
      where: { restauranteId, activo: true },
      orderBy: { numero: 'asc' },
      include: {
        restaurante: { select: { qrBaseUrl: true } },
        mozoMesas: { include: { mozo: { select: { id: true, nombre: true } } } },
      },
    })

    return Promise.all(
      mesas.map(async (m) => ({ ...m, qrImage: await this.generateQr(m.qrToken, m.restaurante.qrBaseUrl, m.restauranteId) })),
    )
  }

  async findOne(id: string, user: JwtPayload) {
    const mesa = await this.getMesaOrThrow(id)
    await this.assertRestauranteOwnership(mesa.restauranteId, user)
    return { ...mesa, qrImage: await this.generateQr(mesa.qrToken, mesa.restaurante.qrBaseUrl, mesa.restauranteId) }
  }

  async update(id: string, dto: UpdateMesaDto, user: JwtPayload) {
    const mesa = await this.getMesaOrThrow(id)
    await this.assertRestauranteOwnership(mesa.restauranteId, user)

    if (dto.numero && dto.numero !== mesa.numero) {
      const conflict = await this.prisma.mesa.findFirst({
        where: { restauranteId: mesa.restauranteId, numero: dto.numero, activo: true, id: { not: id } },
      })
      if (conflict) throw new ConflictException(`Ya existe una mesa con el número ${dto.numero}`)
    }

    const updated = await this.prisma.mesa.update({ where: { id }, data: dto })
    return { ...updated, qrImage: await this.generateQr(updated.qrToken, mesa.restaurante.qrBaseUrl, updated.restauranteId) }
  }

  async remove(id: string, user: JwtPayload) {
    const mesa = await this.getMesaOrThrow(id)
    await this.assertRestauranteOwnership(mesa.restauranteId, user)
    return this.prisma.mesa.update({ where: { id }, data: { activo: false } })
  }

  async regenerarQr(id: string, user: JwtPayload) {
    const mesa = await this.getMesaOrThrow(id)
    await this.assertRestauranteOwnership(mesa.restauranteId, user)

    const qrToken = randomUUID()
    const updated = await this.prisma.mesa.update({ where: { id }, data: { qrToken } })
    return { ...updated, qrImage: await this.generateQr(qrToken, mesa.restaurante.qrBaseUrl, mesa.restauranteId) }
  }

  async cambiarPin(id: string, pin: string, user: JwtPayload) {
    const mesa = await this.getMesaOrThrow(id)
    await this.assertRestauranteOwnership(mesa.restauranteId, user)

    const conflict = await this.prisma.mesa.findFirst({
      where: { restauranteId: mesa.restauranteId, pin, id: { not: id } },
    })
    if (conflict) throw new ConflictException(`El PIN ${pin} ya está en uso en este restaurante`)

    return this.prisma.mesa.update({ where: { id }, data: { pin } })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async getMesaOrThrow(id: string) {
    const mesa = await this.prisma.mesa.findUnique({
      where: { id },
      include: { restaurante: { select: { qrBaseUrl: true } } },
    })
    if (!mesa || !mesa.activo) throw new NotFoundException('Mesa no encontrada')
    return mesa
  }

  private async assertRestauranteOwnership(restauranteId: string, user: JwtPayload) {
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

  private async assertRestauranteAccess(restauranteId: string) {
    const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId } })
    if (!restaurante || !restaurante.activo) throw new NotFoundException('Restaurante no encontrado')
    return restaurante
  }

  private async generatePin(restauranteId: string): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const pin = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')
      const exists = await this.prisma.mesa.findFirst({ where: { restauranteId, pin } })
      if (!exists) return pin
    }
    throw new ConflictException('No se pudo generar un PIN único para este restaurante')
  }

  private generateQr(token: string, qrBaseUrl: string | null, restauranteId: string): Promise<string> {
    const base = qrBaseUrl ?? 'https://menyu.app'
    const url = `${base}/check-in?restaurantId=${restauranteId}&tableCode=${token}`
    return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 300 })
  }
}
