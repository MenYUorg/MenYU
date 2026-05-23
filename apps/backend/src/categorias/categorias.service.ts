import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'
import { CreateCategoriaDto } from './dto/create-categoria.dto'
import { UpdateCategoriaDto } from './dto/update-categoria.dto'

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoriaDto, user: JwtPayload) {
    await this.assertRestauranteOwnership(dto.restauranteId, user)
    await this.assertNombreCategoriaUnico(dto.restauranteId, dto.nombre)
    return this.prisma.categoriaMenu.create({ data: dto })
  }

  async findAll(restauranteId: string, user: JwtPayload) {
    await this.assertRestauranteOwnership(restauranteId, user)
    return this.prisma.categoriaMenu.findMany({
      where: { restauranteId },
      orderBy: { orden: 'asc' },
    })
  }

  async findOne(id: string, user: JwtPayload) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)
    return this.prisma.categoriaMenu.findUnique({ where: { id } })
  }

  async update(id: string, dto: UpdateCategoriaDto, user: JwtPayload) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)

    if (dto.nombre && dto.nombre !== categoria.nombre) {
      await this.assertNombreCategoriaUnico(categoria.restauranteId, dto.nombre, id)
    }

    return this.prisma.categoriaMenu.update({ where: { id }, data: dto })
  }

  async remove(id: string, user: JwtPayload) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)
    await this.prisma.categoriaMenu.delete({ where: { id } })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async getCategoriaOrThrow(id: string) {
    const categoria = await this.prisma.categoriaMenu.findUnique({ where: { id } })
    if (!categoria) throw new NotFoundException('Categoría no encontrada')
    return categoria
  }

  private async assertNombreCategoriaUnico(restauranteId: string, nombre: string, excludeId?: string) {
    const existing = await this.prisma.categoriaMenu.findFirst({
      where: {
        restauranteId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
    if (existing) throw new ConflictException(`Ya existe una categoría con el nombre "${nombre}"`)
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
