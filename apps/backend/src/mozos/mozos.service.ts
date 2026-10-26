import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, Rol } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { UpdateMozoDto } from './dto/update-mozo.dto'

/** Lo que se ve de un mozo. Nunca la contraseña del login propio (`passwordHash`). */
export const MOZO_SELECT = {
  id: true,
  restauranteId: true,
  nombre: true,
  email: true,
  telefono: true,
  activo: true,
  esJefeSalon: true,
  createdAt: true,
  usuarioId: true,
} satisfies Prisma.MozoSelect

/**
 * El perfil operativo de los mozos de un restaurante (mesas asignadas, llamados). El acceso se da y se quita desde
 * Personal (invitar y quitar acceso): acá no se crean mozos ni se cambia su email.
 */
@Injectable()
export class MozosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async findAll(restauranteId: string) {
    return this.prisma.mozo.findMany({
      where: { restauranteId, activo: true },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        email: true,
        telefono: true,
        activo: true,
        esJefeSalon: true,
        createdAt: true,
      },
    })
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    return this.getConPermiso(id, usuario)
  }

  /** Solo el OWNER. El email y la contraseña son de la cuenta de Supabase; si es jefe de salón, de la membresía. */
  async update(id: string, dto: UpdateMozoDto, usuario: UsuarioAutenticado) {
    await this.getConPermiso(id, usuario, ['OWNER'])
    return this.prisma.mozo.update({ where: { id }, data: dto, select: MOZO_SELECT })
  }

  /**
   * Da de baja a un mozo del login propio (sin cuenta de Supabase). Solo el OWNER. A uno con cuenta se le quita
   * el acceso desde Personal, que también borra su membresía.
   */
  async assignMesa(mozoId: string, mesaId: string, usuario: UsuarioAutenticado) {
    const mozo = await this.getConPermiso(mozoId, usuario)

    const mesa = await this.prisma.mesa.findUnique({ where: { id: mesaId } })
    if (!mesa) throw new NotFoundException('Mesa no encontrada')
    if (mesa.restauranteId !== mozo.restauranteId) {
      throw new BadRequestException('La mesa no pertenece al mismo restaurante que el mozo')
    }

    try {
      return await this.prisma.mozoMesa.create({ data: { mozoId, mesaId } })
    } catch {
      throw new ConflictException('El mozo ya tiene asignada esa mesa')
    }
  }

  async unassignMesa(mozoId: string, mesaId: string, usuario: UsuarioAutenticado) {
    await this.getConPermiso(mozoId, usuario)

    const asignacion = await this.prisma.mozoMesa.findUnique({
      where: { mesaId_mozoId: { mesaId, mozoId } },
    })
    if (!asignacion) throw new NotFoundException('Asignación no encontrada')

    await this.prisma.mozoMesa.delete({ where: { mesaId_mozoId: { mesaId, mozoId } } })
  }

  async getMesas(mozoId: string, usuario: UsuarioAutenticado) {
    await this.getConPermiso(mozoId, usuario)

    const asignaciones = await this.prisma.mozoMesa.findMany({
      where: { mozoId },
      include: {
        mesa: { select: { id: true, numero: true, estado: true, activo: true } },
      },
      orderBy: { mesa: { numero: 'asc' } },
    })

    return asignaciones.map((a) => a.mesa)
  }

  async llamadosHoy(mozoId: string, usuario: UsuarioAutenticado) {
    await this.getConPermiso(mozoId, usuario)

    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const total = await this.prisma.llamadoMozo.count({
      where: {
        mozoId,
        estado: 'atendido',
        createdAt: { gte: hoy },
      },
    })

    return { total }
  }

  /** El mozo (404 si no existe), si el usuario tiene alguno de `roles` en su restaurante (403 si no). */
  private async getConPermiso(id: string, usuario: UsuarioAutenticado, roles: readonly Rol[] = ADMINISTRACION) {
    const mozo = await this.prisma.mozo.findUnique({ where: { id }, select: MOZO_SELECT })
    if (!mozo) throw new NotFoundException('Mozo no encontrado')
    await this.acceso.exigirRol(usuario.id, mozo.restauranteId, roles)
    return mozo
  }
}
