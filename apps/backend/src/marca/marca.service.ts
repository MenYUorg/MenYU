import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'
import { CreateMarcaDto } from './dto/create-marca.dto'
import { UpdateMarcaDto } from './dto/update-marca.dto'

const DETAIL_INCLUDE = {
  restaurantes: {
    where: { activo: true },
    include: {
      admins: { include: { admin: { select: { id: true, email: true, rol: true } } } },
      mozos: { where: { activo: true }, select: { id: true, nombre: true, email: true } },
      mesas: true,
    },
  },
  items: {
    where: { disponible: true },
    include: {
      comanda: true,
    },
  },
} as const

@Injectable()
export class MarcaService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: DETAIL_INCLUDE,
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
