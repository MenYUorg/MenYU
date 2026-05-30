import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload, RolAdmin } from '../auth/auth.service'
import { CreateAdminDto } from './dto/create-admin.dto'
import { UpdateAdminDto } from './dto/update-admin.dto'

const BCRYPT_ROUNDS = 10

@Injectable()
export class AdminsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAdminDto, user: JwtPayload) {
    const rolCreado: RolAdmin = 'GERENTE'

    if (user.rol === 'OWNER') {
      // OWNER solo puede crear GERENTE — sin excepción
    } else if (user.rol === 'ROOT') {
      // ROOT puede crear cualquier rol (por ahora siempre GERENTE desde este endpoint)
    } else {
      throw new ForbiddenException('Sin permisos para crear admins')
    }

    const existing = await this.prisma.admin.findUnique({ where: { email: dto.email } })
    if (existing) throw new ConflictException('El email ya está registrado')

    const marcaId = await this.resolveMarcaId(user)
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    const admin = await this.prisma.admin.create({
      data: { email: dto.email, passwordHash, rol: rolCreado, marcaId },
    })

    const { passwordHash: _, ...result } = admin
    return result
  }

  async findAll(user: JwtPayload) {
    if (user.rol === 'ROOT') {
      return this.prisma.admin.findMany({
        select: { id: true, email: true, rol: true, marcaId: true },
        orderBy: { email: 'asc' },
      })
    }

    const marcaId = await this.resolveMarcaId(user)
    return this.prisma.admin.findMany({
      where: { marcaId },
      select: { id: true, email: true, rol: true, marcaId: true },
      orderBy: { email: 'asc' },
    })
  }

  async update(id: string, dto: UpdateAdminDto, user: JwtPayload) {
    const target = await this.prisma.admin.findUnique({ where: { id } })
    if (!target) throw new NotFoundException('Admin no encontrado')

    if (user.rol === 'OWNER') {
      const ownerMarcaId = await this.resolveMarcaId(user)
      if (target.marcaId !== ownerMarcaId) throw new ForbiddenException('No tenés acceso a este admin')
    }

    const data: Record<string, unknown> = {}
    if (dto.email !== undefined) data['email'] = dto.email
    if (dto.password) data['passwordHash'] = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    const updated = await this.prisma.admin.update({ where: { id }, data })
    const { passwordHash: _, ...result } = updated
    return result
  }

  async remove(id: string, user: JwtPayload) {
    const target = await this.prisma.admin.findUnique({ where: { id } })
    if (!target) throw new NotFoundException('Admin no encontrado')

    if (user.rol === 'OWNER') {
      const ownerMarcaId = await this.resolveMarcaId(user)
      if (target.marcaId !== ownerMarcaId) throw new ForbiddenException('No tenés acceso a este admin')
    }

    await this.prisma.admin.delete({ where: { id } })
  }

  private async resolveMarcaId(user: JwtPayload): Promise<string | undefined> {
    if (user.rol === 'ROOT') return undefined

    const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
    if (!admin?.marcaId) throw new ForbiddenException('Tu cuenta no tiene una marca asociada')
    return admin.marcaId
  }
}
