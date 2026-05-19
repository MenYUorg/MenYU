import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'
import { CreateMozoDto } from './dto/create-mozo.dto'
import { UpdateMozoDto } from './dto/update-mozo.dto'

const BCRYPT_ROUNDS = 10

@Injectable()
export class MozosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMozoDto, user: JwtPayload) {
    await this.assertRestauranteOwnership(dto.restauranteId, user)

    if (dto.email) {
      const existing = await this.prisma.mozo.findFirst({ where: { email: dto.email } })
      if (existing) throw new ConflictException('Ya existe un mozo con ese email')
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
    const { password: _, ...data } = dto
    return this.prisma.mozo.create({ data: { ...data, passwordHash } })
  }

  async findAll(restauranteId: string, user: JwtPayload) {
    await this.assertRestauranteOwnership(restauranteId, user)
    return this.prisma.mozo.findMany({
      where: { restauranteId },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        email: true,
        telefono: true,
        activo: true,
        esJefeSalon: true,
        createdAt: true,
      },
    })
  }

  async findOne(id: string, user: JwtPayload) {
    const mozo = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(mozo.restauranteId, user)
    return mozo
  }

  async update(id: string, dto: UpdateMozoDto, user: JwtPayload) {
    const mozo = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(mozo.restauranteId, user)

    const { password, ...rest } = dto
    const data: Record<string, unknown> = { ...rest }

    if (password) {
      data.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    }

    return this.prisma.mozo.update({ where: { id }, data })
  }

  async remove(id: string, user: JwtPayload) {
    const mozo = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(mozo.restauranteId, user)
    await this.prisma.mozo.update({ where: { id }, data: { activo: false } })
  }

  private async getOrThrow(id: string) {
    const mozo = await this.prisma.mozo.findUnique({ where: { id } })
    if (!mozo) throw new NotFoundException('Mozo no encontrado')
    return mozo
  }

  private async assertRestauranteOwnership(restauranteId: string, user: JwtPayload) {
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
}
