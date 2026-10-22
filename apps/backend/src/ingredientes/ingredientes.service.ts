import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CreateIngredienteDto } from './dto/create-ingrediente.dto'
import { UpdateIngredienteDto } from './dto/update-ingrediente.dto'

@Injectable()
export class IngredientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async create(dto: CreateIngredienteDto) {
    const existing = await this.prisma.ingrediente.findFirst({
      where: { restauranteId: dto.restauranteId, nombre: { equals: dto.nombre, mode: 'insensitive' } },
    })
    if (existing) throw new ConflictException(`Ya existe un ingrediente con el nombre "${dto.nombre}"`)

    return this.prisma.ingrediente.create({ data: dto })
  }

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async findAll(restauranteId: string) {
    return this.prisma.ingrediente.findMany({
      where: { restauranteId },
      orderBy: { nombre: 'asc' },
    })
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    return this.getConPermiso(id, usuario)
  }

  async update(id: string, dto: UpdateIngredienteDto, usuario: UsuarioAutenticado) {
    const ingrediente = await this.getConPermiso(id, usuario)

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

  async remove(id: string, usuario: UsuarioAutenticado) {
    await this.getConPermiso(id, usuario)

    const enUso = await this.prisma.itemIngrediente.count({ where: { ingredienteId: id } })
    if (enUso > 0) {
      throw new ConflictException(
        `No se puede eliminar: el ingrediente está asociado a ${enUso} ítem(s) del menú`,
      )
    }

    await this.prisma.ingrediente.delete({ where: { id } })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** El ingrediente (404 si no existe), si el usuario es OWNER o GERENTE de su restaurante (403 si no). */
  private async getConPermiso(id: string, usuario: UsuarioAutenticado) {
    const ingrediente = await this.prisma.ingrediente.findUnique({ where: { id } })
    if (!ingrediente) throw new NotFoundException('Ingrediente no encontrado')
    await this.acceso.exigirRol(usuario.id, ingrediente.restauranteId, ADMINISTRACION)
    return ingrediente
  }
}
