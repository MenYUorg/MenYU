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
import { CreateSubcategoriaDto } from './dto/create-subcategoria.dto'
import { UpdateSubcategoriaDto } from './dto/update-subcategoria.dto'

const SUB_INCLUDE = { subcategorias: { orderBy: { orden: 'asc' as const } } }

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categorías ─────────────────────────────────────────────────────────

  async create(dto: CreateCategoriaDto, user: JwtPayload) {
    await this.assertRestauranteOwnership(dto.restauranteId, user)
    await this.assertNombreCategoriaUnico(dto.restauranteId, dto.nombre)

    return this.prisma.categoriaMenu.create({ data: dto, include: SUB_INCLUDE })
  }

  async findAll(restauranteId: string, user: JwtPayload) {
    await this.assertRestauranteOwnership(restauranteId, user)

    return this.prisma.categoriaMenu.findMany({
      where: { restauranteId },
      orderBy: { orden: 'asc' },
      include: SUB_INCLUDE,
    })
  }

  async findOne(id: string, user: JwtPayload) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)
    return this.prisma.categoriaMenu.findUnique({ where: { id }, include: SUB_INCLUDE })
  }

  async update(id: string, dto: UpdateCategoriaDto, user: JwtPayload) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)

    if (dto.nombre && dto.nombre !== categoria.nombre) {
      await this.assertNombreCategoriaUnico(categoria.restauranteId, dto.nombre, id)
    }

    return this.prisma.categoriaMenu.update({ where: { id }, data: dto, include: SUB_INCLUDE })
  }

  async remove(id: string, user: JwtPayload) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)

    const totalSubs = await this.prisma.subcategoriaMenu.count({ where: { categoriaId: id } })
    if (totalSubs > 0) {
      throw new ConflictException(
        `No se puede eliminar: la categoría tiene ${totalSubs} subcategoría(s)`,
      )
    }

    await this.prisma.categoriaMenu.delete({ where: { id } })
  }

  // ── Subcategorías ──────────────────────────────────────────────────────

  async createSub(categoriaId: string, dto: CreateSubcategoriaDto, user: JwtPayload) {
    const categoria = await this.getCategoriaOrThrow(categoriaId)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)
    await this.assertNombreSubUnico(categoriaId, dto.nombre)

    return this.prisma.subcategoriaMenu.create({ data: { ...dto, categoriaId } })
  }

  async findAllSubs(categoriaId: string, user: JwtPayload) {
    const categoria = await this.getCategoriaOrThrow(categoriaId)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)

    return this.prisma.subcategoriaMenu.findMany({
      where: { categoriaId },
      orderBy: { orden: 'asc' },
    })
  }

  async findOneSub(id: string, user: JwtPayload) {
    const sub = await this.getSubOrThrow(id)
    const categoria = await this.getCategoriaOrThrow(sub.categoriaId)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)
    return sub
  }

  async updateSub(id: string, dto: UpdateSubcategoriaDto, user: JwtPayload) {
    const sub = await this.getSubOrThrow(id)
    const categoria = await this.getCategoriaOrThrow(sub.categoriaId)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)

    if (dto.nombre && dto.nombre !== sub.nombre) {
      await this.assertNombreSubUnico(sub.categoriaId, dto.nombre, id)
    }

    return this.prisma.subcategoriaMenu.update({ where: { id }, data: dto })
  }

  async removeSub(id: string, user: JwtPayload) {
    const sub = await this.getSubOrThrow(id)
    const categoria = await this.getCategoriaOrThrow(sub.categoriaId)
    await this.assertRestauranteOwnership(categoria.restauranteId, user)

    const totalItems = await this.prisma.itemMenu.count({ where: { subcategoriaId: id } })
    if (totalItems > 0) {
      throw new ConflictException(
        `No se puede eliminar: la subcategoría tiene ${totalItems} ítem(s) del menú`,
      )
    }

    await this.prisma.subcategoriaMenu.delete({ where: { id } })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async getCategoriaOrThrow(id: string) {
    const categoria = await this.prisma.categoriaMenu.findUnique({ where: { id } })
    if (!categoria) throw new NotFoundException('Categoría no encontrada')
    return categoria
  }

  private async getSubOrThrow(id: string) {
    const sub = await this.prisma.subcategoriaMenu.findUnique({ where: { id } })
    if (!sub) throw new NotFoundException('Subcategoría no encontrada')
    return sub
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

  private async assertNombreSubUnico(categoriaId: string, nombre: string, excludeId?: string) {
    const existing = await this.prisma.subcategoriaMenu.findFirst({
      where: {
        categoriaId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
    if (existing) throw new ConflictException(`Ya existe una subcategoría con el nombre "${nombre}"`)
  }

  private async assertRestauranteOwnership(restauranteId: string, user: JwtPayload) {
    if (user.rol === 'ROOT') return
    const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
    const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId } })
    if (!admin || !restaurante || admin.marcaId !== restaurante.marcaId) {
      throw new ForbiddenException('No tenés acceso a este restaurante')
    }
  }
}
