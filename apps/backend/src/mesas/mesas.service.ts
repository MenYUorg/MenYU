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
    await this.assertRestauranteAccess(dto.restauranteId)

    const existing = await this.prisma.mesa.findFirst({
      where: { restauranteId: dto.restauranteId, numero: dto.numero, activo: true },
    })
    if (existing) throw new ConflictException(`Ya existe una mesa con el número ${dto.numero}`)

    const qrToken = randomUUID()
    const mesa = await this.prisma.mesa.create({
      data: { ...dto, qrToken },
    })

    return { ...mesa, qrImage: await this.generateQr(qrToken) }
  }

  async findAll(restauranteId: string, user: JwtPayload) {
    await this.assertRestauranteOwnership(restauranteId, user)

    const mesas = await this.prisma.mesa.findMany({
      where: { restauranteId, activo: true },
      orderBy: { numero: 'asc' },
    })

    return Promise.all(mesas.map(async (m) => ({ ...m, qrImage: await this.generateQr(m.qrToken) })))
  }

  async findOne(id: string, user: JwtPayload) {
    const mesa = await this.getMesaOrThrow(id)
    await this.assertRestauranteOwnership(mesa.restauranteId, user)
    return { ...mesa, qrImage: await this.generateQr(mesa.qrToken) }
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
    return { ...updated, qrImage: await this.generateQr(updated.qrToken) }
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
    return { ...updated, qrImage: await this.generateQr(qrToken) }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async getMesaOrThrow(id: string) {
    const mesa = await this.prisma.mesa.findUnique({ where: { id } })
    if (!mesa || !mesa.activo) throw new NotFoundException('Mesa no encontrada')
    return mesa
  }

  private async assertRestauranteOwnership(restauranteId: string, user: JwtPayload) {
    if (user.rol === 'ROOT') return
    const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
    if (!admin || admin.restauranteId !== restauranteId) {
      throw new ForbiddenException('No tenés acceso a este restaurante')
    }
  }

  private async assertRestauranteAccess(restauranteId: string) {
    const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId } })
    if (!restaurante || !restaurante.activo) throw new NotFoundException('Restaurante no encontrado')
  }

  private generateQr(token: string): Promise<string> {
    return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', width: 300 })
  }
}
