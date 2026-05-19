import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'
import { CreateIngredienteDto } from './dto/create-ingrediente.dto'
import { UpdateIngredienteDto } from './dto/update-ingrediente.dto'

@Injectable()
export class IngredientesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIngredienteDto, user: JwtPayload) {
    await this.assertRestauranteOwnership(dto.restauranteId, user)

    const existing = await this.prisma.ingrediente.findFirst({
      where: { restauranteId: dto.restauranteId, nombre: { equals: dto.nombre, mode: 'insensitive' } },
    })
    if (existing) throw new ConflictException(`Ya existe un ingrediente con el nombre "${dto.nombre}"`)

    return this.prisma.ingrediente.create({ data: dto })
  }

  async findAll(restauranteId: string, user: JwtPayload) {
    await this.assertRestauranteOwnership(restauranteId, user)

    return this.prisma.ingrediente.findMany({
      where: { restauranteId },
      orderBy: { nombre: 'asc' },
    })
  }

  async findOne(id: string, user: JwtPayload) {
    const ingrediente = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(ingrediente.restauranteId, user)
    return ingrediente
  }

  async update(id: string, dto: UpdateIngredienteDto, user: JwtPayload) {
    const ingrediente = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(ingrediente.restauranteId, user)

    if (dto.nombre && dto.nombre !== ingrediente.nombre) {
      const conflict = await this.prisma.ingrediente.findFirst({
        where: {
          restauranteId: ingrediente.restauranteId,
          nombre: { equals: dto.nombre, mode: 'insensitive' },
          id: { not: id },
        },
      })
      if (conflict) throw new ConflictException(`Ya existe un ingrediente con el nombre "${dto.nombre}"`)
    }

    return this.prisma.ingrediente.update({ where: { id }, data: dto })
  }

  async remove(id: string, user: JwtPayload) {
    const ingrediente = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(ingrediente.restauranteId, user)

    const enUso = await this.prisma.itemIngrediente.count({ where: { ingredienteId: id } })
    if (enUso > 0) {
      throw new ConflictException(
        `No se puede eliminar: el ingrediente está asociado a ${enUso} ítem(s) del menú`,
      )
    }

    await this.prisma.ingrediente.delete({ where: { id } })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async getOrThrow(id: string) {
    const ingrediente = await this.prisma.ingrediente.findUnique({ where: { id } })
    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado')
    return ingrediente
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
