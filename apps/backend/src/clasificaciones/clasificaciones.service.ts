import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/auth.service'

@Injectable()
export class ClasificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(restauranteId: string) {
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: { id: true },
    })
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado')

    return this.prisma.clasificacionDieta.findMany({
      orderBy: { nombre: 'asc' },
    })
  }

  async create(nombre: string, user: JwtPayload) {
    const normalizado = nombre.trim()
    const existing = await this.prisma.clasificacionDieta.findFirst({
      where: { nombre: { equals: normalizado, mode: 'insensitive' } },
    })
    if (existing) throw new ConflictException(`Ya existe la clasificación "${normalizado}"`)

    return this.prisma.clasificacionDieta.create({ data: { nombre: normalizado } })
  }

  async update(id: string, nombre: string, user: JwtPayload) {
    await this.getOrThrow(id)

    const normalizado = nombre.trim()
    const existing = await this.prisma.clasificacionDieta.findFirst({
      where: { nombre: { equals: normalizado, mode: 'insensitive' }, id: { not: id } },
    })
    if (existing) throw new ConflictException(`Ya existe la clasificación "${normalizado}"`)

    return this.prisma.clasificacionDieta.update({ where: { id }, data: { nombre: normalizado } })
  }

  async remove(id: string, user: JwtPayload) {
    await this.getOrThrow(id)

    const enUso = await this.prisma.itemClasificacion.count({ where: { clasificacionId: id } })
    if (enUso > 0) {
      throw new ConflictException(
        `No se puede eliminar: la clasificación está asignada a ${enUso} ítem(s). Desasignala primero.`,
      )
    }

    await this.prisma.clasificacionDieta.delete({ where: { id } })
  }

  // ── Asignación a ítems ─────────────────────────────────────────────────

  async addToItem(itemId: string, clasificacionId: string, user: JwtPayload) {
    const item = await this.prisma.itemMenu.findUnique({ where: { id: itemId } })
    if (!item) throw new NotFoundException('Ítem no encontrado')

    await this.assertRestauranteOwnership(item.restauranteId, user)

    await this.getOrThrow(clasificacionId)

    const yaAsignada = await this.prisma.itemClasificacion.findUnique({
      where: { itemId_clasificacionId: { itemId, clasificacionId } },
    })
    if (yaAsignada) throw new ConflictException('Esa clasificación ya está asignada a este ítem')

    await this.prisma.itemClasificacion.create({ data: { itemId, clasificacionId } })

    return this.prisma.itemMenu.findUnique({
      where: { id: itemId },
      include: { clasificaciones: { include: { clasificacion: true } } },
    })
  }

  async removeFromItem(itemId: string, clasificacionId: string, user: JwtPayload) {
    const item = await this.prisma.itemMenu.findUnique({ where: { id: itemId } })
    if (!item) throw new NotFoundException('Ítem no encontrado')

    await this.assertRestauranteOwnership(item.restauranteId, user)

    const asignacion = await this.prisma.itemClasificacion.findUnique({
      where: { itemId_clasificacionId: { itemId, clasificacionId } },
    })
    if (!asignacion) throw new NotFoundException('Esa clasificación no está asignada a este ítem')

    await this.prisma.itemClasificacion.delete({
      where: { itemId_clasificacionId: { itemId, clasificacionId } },
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async getOrThrow(id: string) {
    const c = await this.prisma.clasificacionDieta.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('Clasificación no encontrada')
    return c
  }

  private async assertRestauranteOwnership(restauranteId: string, user: JwtPayload) {
    if (user.rol === 'ROOT') return
    const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
    if (!admin) throw new ForbiddenException('No tenés acceso')
    const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId } })
    if (!restaurante || admin.marcaId !== restaurante.marcaId) {
      throw new ForbiddenException('No tenés acceso a este restaurante')
    }
  }
}
