import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'
import { CreateRestauranteDto } from './dto/create-restaurante.dto'
import { UpdateRestauranteDto } from './dto/update-restaurante.dto'

const DETAIL_INCLUDE = {
  marca: true,
  mozos: { where: { activo: true } },
  comandas: true,
  categorias: true,
  menus: true,
  mesas: true,
  ingredientes: true,
  itemSucursal: { include: { item: true } },
} as const

@Injectable()
export class RestauranteService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRestauranteDto) {
    return this.prisma.restaurante.create({ data: dto })
  }

  async findAll(user: JwtPayload) {
    if (user.rol === 'ROOT') {
      return this.prisma.restaurante.findMany({
        where: { activo: true },
        include: { marca: true },
      })
    }
    if (user.rol === 'GERENTE') {
      const restauranteIds = await this.getRestaurantesForGerente(user.sub)
      return this.prisma.restaurante.findMany({
        where: { id: { in: restauranteIds }, activo: true },
        include: { marca: true },
      })
    }
    const marcaId = await this.getMarcaIdForAdmin(user.sub)
    return this.prisma.restaurante.findMany({
      where: { marcaId, activo: true },
      include: { marca: true },
    })
  }

  async findOne(id: string, user: JwtPayload) {
    if (user.rol === 'OWNER') {
      const marcaId = await this.getMarcaIdForAdmin(user.sub)
      const restaurante = await this.prisma.restaurante.findUnique({ where: { id } })
      if (!restaurante || restaurante.marcaId !== marcaId)
        throw new ForbiddenException('No tenés acceso a este restaurante')
    }
    if (user.rol === 'GERENTE') {
      await this.assertRestauranteOwnership(id, user)
    }
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    })
    if (!restaurante || !restaurante.activo) throw new NotFoundException('Restaurante no encontrado')
    return restaurante
  }

  async update(id: string, dto: UpdateRestauranteDto, user: JwtPayload) {
    if (user.rol === 'OWNER') {
      const marcaId = await this.getMarcaIdForAdmin(user.sub)
      const restaurante = await this.prisma.restaurante.findUnique({ where: { id } })
      if (!restaurante || restaurante.marcaId !== marcaId)
        throw new ForbiddenException('No tenés acceso a este restaurante')
    }
    if (user.rol === 'GERENTE') {
      await this.assertRestauranteOwnership(id, user)
    }
    if (dto.nombreSeccionRecomendados !== undefined && user.rol === 'GERENTE') {
      throw new ForbiddenException('Solo el owner puede renombrar la sección de recomendados')
    }
    await this.assertExists(id)
    return this.prisma.restaurante.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    await this.assertExists(id)
    return this.prisma.restaurante.update({ where: { id }, data: { activo: false } })
  }

  private async assertExists(id: string): Promise<void> {
    const r = await this.prisma.restaurante.findUnique({ where: { id } })
    if (!r || !r.activo) throw new NotFoundException('Restaurante no encontrado')
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
