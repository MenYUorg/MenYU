import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CreateCategoriaDto } from './dto/create-categoria.dto'
import { UpdateCategoriaDto } from './dto/update-categoria.dto'

@Injectable()
export class CategoriasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async create(dto: CreateCategoriaDto) {
    await this.assertNombreCategoriaUnico(dto.restauranteId, dto.nombre)
    return this.prisma.categoriaMenu.create({ data: dto })
  }

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async findAll(restauranteId: string) {
    return this.prisma.categoriaMenu.findMany({
      where: { restauranteId },
      orderBy: { orden: 'asc' },
    })
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.acceso.exigirRol(usuario.id, categoria.restauranteId, ADMINISTRACION)
    return this.prisma.categoriaMenu.findUnique({ where: { id } })
  }

  async update(id: string, dto: UpdateCategoriaDto, usuario: UsuarioAutenticado) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.acceso.exigirRol(usuario.id, categoria.restauranteId, ADMINISTRACION)

    if (dto.nombre && dto.nombre !== categoria.nombre) {
      await this.assertNombreCategoriaUnico(categoria.restauranteId, dto.nombre, id)
    }

    return this.prisma.categoriaMenu.update({ where: { id }, data: dto })
  }

  async remove(id: string, usuario: UsuarioAutenticado) {
    const categoria = await this.getCategoriaOrThrow(id)
    await this.acceso.exigirRol(usuario.id, categoria.restauranteId, ['OWNER'])
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
}
