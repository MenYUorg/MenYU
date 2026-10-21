import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LogosService } from '../storage/logos.service'
import { assertOwnerDeMarca } from '../common/assert-owner-access'
import { RESTAURANTE_DISPONIBLE } from '../common/restaurante-disponible'
import { JwtPayload } from '../auth/auth.service'
import { CreateMarcaDto } from './dto/create-marca.dto'
import { UpdateMarcaDto } from './dto/update-marca.dto'

// Los ítems pertenecen a cada restaurante, no a la marca: se piden con GET /items?restauranteId=
export const MARCA_DETAIL_INCLUDE = {
  restaurantes: {
    where: { activo: true },
    include: {
      admins: { include: { admin: { select: { id: true, email: true, rol: true } } } },
      mozos: { where: { activo: true }, select: { id: true, nombre: true, email: true } },
      mesas: true,
    },
  },
} as const

@Injectable()
export class MarcaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logos: LogosService,
  ) {}

  /** Público. Una marca dada de baja no muestra sus restaurantes (aunque cada uno siga activo): vuelve todo al reactivarla. */
  async findRestaurantesByMarca(marcaId: string) {
    return this.prisma.restaurante.findMany({
      where: { marcaId, ...RESTAURANTE_DISPONIBLE },
      select: { id: true, nombre: true, direccion: true },
      orderBy: { nombre: 'asc' },
    })
  }

  async findAllPublicas() {
    const marcas = await this.prisma.marca.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        _count: {
          select: { restaurantes: { where: { activo: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
    })
    return marcas.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      restaurantesActivos: m._count.restaurantes,
    }))
  }

  async create(dto: CreateMarcaDto) {
    const existing = await this.prisma.marca.findUnique({ where: { slug: dto.slug } })
    if (existing) throw new ConflictException('Ya existe una marca con ese slug')
    return this.prisma.marca.create({ data: dto })
  }

  async findAll(user: JwtPayload) {
    if (user.rol === 'ROOT') {
      return this.prisma.marca.findMany({
        where: { activo: true },
        include: { restaurantes: { where: { activo: true } } },
      })
    }
    if (user.rol === 'GERENTE') {
      const restauranteIds = await this.getRestaurantesForGerente(user.sub)
      const restaurantes = await this.prisma.restaurante.findMany({
        where: { id: { in: restauranteIds } },
        select: { marcaId: true },
        distinct: ['marcaId'],
      })
      const marcaIds = restaurantes.map((r: { marcaId: string }) => r.marcaId)
      return this.prisma.marca.findMany({
        where: { id: { in: marcaIds }, activo: true },
        include: { restaurantes: { where: { activo: true } } },
      })
    }
    const marcaId = await this.getMarcaIdForAdmin(user.sub)
    return this.prisma.marca.findMany({
      where: { id: marcaId, activo: true },
      include: { restaurantes: { where: { activo: true } } },
    })
  }

  async findOne(id: string, user: JwtPayload) {
    if (user.rol === 'OWNER') {
      const marcaId = await this.getMarcaIdForAdmin(user.sub)
      if (marcaId !== id) throw new ForbiddenException('No tenés acceso a esta marca')
    }
    if (user.rol === 'GERENTE') {
      throw new ForbiddenException('Los gerentes no tienen acceso a marcas')
    }
    const marca = await this.prisma.marca.findUnique({
      where: { id },
      include: MARCA_DETAIL_INCLUDE,
    })
    if (!marca || !marca.activo) throw new NotFoundException('Marca no encontrada')
    return marca
  }

  async update(id: string, dto: UpdateMarcaDto, user: JwtPayload) {
    if (user.rol === 'OWNER') {
      const marcaId = await this.getMarcaIdForAdmin(user.sub)
      if (marcaId !== id) throw new ForbiddenException('No tenés acceso a esta marca')
    }
    if (user.rol === 'GERENTE') {
      throw new ForbiddenException('Los gerentes no pueden modificar marcas')
    }
    await this.assertExists(id)
    if (dto.slug) {
      const conflict = await this.prisma.marca.findFirst({
        where: { slug: dto.slug, id: { not: id } },
      })
      if (conflict) throw new ConflictException('Ya existe una marca con ese slug')
    }
    return this.prisma.marca.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    await this.assertExists(id)
    return this.prisma.marca.update({ where: { id }, data: { activo: false } })
  }

  // ── Logo (solo el OWNER de la marca) ──────────────────────────────────

  async uploadLogo(id: string, file: Express.Multer.File, user: JwtPayload) {
    await assertOwnerDeMarca(this.prisma, id, user)
    await this.assertExists(id)

    const logoUrl = await this.logos.subir('marcas', id, file)
    return this.prisma.marca.update({
      where: { id },
      data: { logoUrl },
      select: { id: true, logoUrl: true },
    })
  }

  async removeLogo(id: string, user: JwtPayload) {
    await assertOwnerDeMarca(this.prisma, id, user)

    const marca = await this.prisma.marca.findUnique({
      where: { id },
      select: { activo: true, logoUrl: true },
    })
    if (!marca || !marca.activo) throw new NotFoundException('Marca no encontrada')
    if (!marca.logoUrl) throw new NotFoundException('Esta marca no tiene logo')

    await this.logos.eliminar('marcas', id)
    return this.prisma.marca.update({
      where: { id },
      data: { logoUrl: null },
      select: { id: true, logoUrl: true },
    })
  }

  private async assertExists(id: string): Promise<void> {
    const marca = await this.prisma.marca.findUnique({ where: { id } })
    if (!marca || !marca.activo) throw new NotFoundException('Marca no encontrada')
  }

  private async getMarcaIdForAdmin(adminId: string): Promise<string> {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } })
    if (!admin || !admin.marcaId) throw new NotFoundException('Admin sin marca asignada')
    return admin.marcaId
  }

  private async getRestaurantesForGerente(adminId: string): Promise<string[]> {
    const asignaciones = await this.prisma.adminRestaurante.findMany({ where: { adminId } })
    return asignaciones.map((a: { restauranteId: string }) => a.restauranteId)
  }
}
