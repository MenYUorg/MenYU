import {
  BadRequestException,
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
      where: { restauranteId, activo: true },
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

  async assignMesa(mozoId: string, mesaId: string, user: JwtPayload) {
    const mozo = await this.getOrThrow(mozoId)
    await this.assertRestauranteOwnership(mozo.restauranteId, user)

    const mesa = await this.prisma.mesa.findUnique({ where: { id: mesaId } })
    if (!mesa) throw new NotFoundException('Mesa no encontrada')
    if (mesa.restauranteId !== mozo.restauranteId) {
      throw new BadRequestException('La mesa no pertenece al mismo restaurante que el mozo')
    }

    try {
      return await this.prisma.mozoMesa.create({ data: { mozoId, mesaId } })
    } catch {
      throw new ConflictException('El mozo ya tiene asignada esa mesa')
    }
  }

  async unassignMesa(mozoId: string, mesaId: string, user: JwtPayload) {
    const mozo = await this.getOrThrow(mozoId)
    await this.assertRestauranteOwnership(mozo.restauranteId, user)

    const asignacion = await this.prisma.mozoMesa.findUnique({
      where: { mesaId_mozoId: { mesaId, mozoId } },
    })
    if (!asignacion) throw new NotFoundException('Asignación no encontrada')

    await this.prisma.mozoMesa.delete({ where: { mesaId_mozoId: { mesaId, mozoId } } })
  }

  async getMesas(mozoId: string, user: JwtPayload) {
    const mozo = await this.getOrThrow(mozoId)
    await this.assertRestauranteOwnership(mozo.restauranteId, user)

    const asignaciones = await this.prisma.mozoMesa.findMany({
      where: { mozoId },
      include: {
        mesa: { select: { id: true, numero: true, estado: true, activo: true } },
      },
      orderBy: { mesa: { numero: 'asc' } },
    })

    return asignaciones.map((a) => a.mesa)
  }

  async llamadosHoy(mozoId: string, user: JwtPayload) {
    const mozo = await this.getOrThrow(mozoId)
    await this.assertRestauranteOwnership(mozo.restauranteId, user)

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const total = await this.prisma.llamadoMozo.count({
      where: {
        mozoId,
        estado: 'atendido',
        createdAt: { gte: hoy },
      },
    })

    return { total }
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
