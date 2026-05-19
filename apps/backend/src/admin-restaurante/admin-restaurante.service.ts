import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

@Injectable()
export class AdminRestauranteService {
  constructor(private readonly prisma: PrismaService) {}

  async asignar(adminId: string, restauranteId: string, user: JwtPayload) {
    await this.assertCanManage(adminId, user)

    const gerente = await this.prisma.admin.findUnique({ where: { id: adminId } })
    if (!gerente) throw new NotFoundException('Admin no encontrado')
    if (gerente.rol !== 'GERENTE') throw new ForbiddenException('Solo se puede asignar restaurantes a gerentes')

    const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId } })
    if (!restaurante || !restaurante.activo) throw new NotFoundException('Restaurante no encontrado')

    const existing = await this.prisma.adminRestaurante.findUnique({
      where: { adminId_restauranteId: { adminId, restauranteId } },
    })
    if (existing) throw new ConflictException('Este gerente ya tiene acceso a ese restaurante')

    return this.prisma.adminRestaurante.create({ data: { adminId, restauranteId } })
  }

  async desasignar(adminId: string, restauranteId: string, user: JwtPayload) {
    await this.assertCanManage(adminId, user)

    const asignacion = await this.prisma.adminRestaurante.findUnique({
      where: { adminId_restauranteId: { adminId, restauranteId } },
    })
    if (!asignacion) throw new NotFoundException('Asignación no encontrada')

    await this.prisma.adminRestaurante.delete({
      where: { adminId_restauranteId: { adminId, restauranteId } },
    })
  }

  async findByAdmin(adminId: string, user: JwtPayload) {
    await this.assertCanManage(adminId, user)

    return this.prisma.adminRestaurante.findMany({
      where: { adminId },
      include: { restaurante: { select: { id: true, nombre: true, activo: true } } },
    })
  }

  async findGerentesByMarca(marcaId: string, user: JwtPayload) {
    if (user.rol === 'OWNER') {
      const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
      if (!admin || admin.marcaId !== marcaId) throw new ForbiddenException('No tenés acceso a esta marca')
    }

    const admins = await this.prisma.admin.findMany({
      where: { marcaId, rol: 'GERENTE' },
      select: {
        id: true,
        email: true,
        rol: true,
        restaurantes: { include: { restaurante: { select: { id: true, nombre: true } } } },
      },
    })
    return admins
  }

  private async assertCanManage(adminId: string, user: JwtPayload) {
    if (user.rol === 'ROOT') return

    const targetAdmin = await this.prisma.admin.findUnique({ where: { id: adminId } })
    if (!targetAdmin) throw new NotFoundException('Admin no encontrado')

    if (user.rol === 'OWNER') {
      const owner = await this.prisma.admin.findUnique({ where: { id: user.sub } })
      if (!owner || owner.marcaId !== targetAdmin.marcaId) {
        throw new ForbiddenException('No tenés acceso a este admin')
      }
      return
    }

    throw new ForbiddenException('No tenés permiso para esta operación')
  }
}
