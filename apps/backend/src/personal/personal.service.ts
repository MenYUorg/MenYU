import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Rol } from '@prisma/client'
import { puedeInvitar } from '../auth/invitaciones/puede-invitar'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PrismaService } from '../prisma/prisma.service'

/** Misma forma que `MiembroDelPersonal` de `@menyu/types`. */
export interface MiembroDelPersonal {
  membresiaId: string
  usuarioId: string
  nombre: string
  email: string
  rol: Rol
}

/** Misma forma que `PersonalDelRestaurante` de `@menyu/types`. */
export interface PersonalDelRestaurante {
  duenos: MiembroDelPersonal[]
  miembros: MiembroDelPersonal[]
  sinCuenta: { mozoId: string; nombre: string; email: string | null; esJefeSalon: boolean }[]
}

const MEMBRESIA_CON_USUARIO = {
  id: true,
  rol: true,
  usuario: { select: { id: true, nombre: true, email: true } },
} as const

function comoMiembro(m: { id: string; rol: Rol; usuario: { id: string; nombre: string; email: string } }): MiembroDelPersonal {
  return { membresiaId: m.id, usuarioId: m.usuario.id, nombre: m.usuario.nombre, email: m.usuario.email, rol: m.rol }
}

/**
 * Quién tiene acceso a un restaurante, y quitárselo (docs/auth/specs/auth.md, Fase 4, decisión 1). El alta es la
 * invitación (`POST /auth/invitaciones`). OWNER o GERENTE del restaurante lo exige la ruta (`@RequiereRol`).
 */
@Injectable()
export class PersonalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  async listar(restauranteId: string): Promise<PersonalDelRestaurante> {
    const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId }, select: { marcaId: true } })
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado')

    const [duenos, miembros, sinCuenta] = await Promise.all([
      this.prisma.membresia.findMany({
        where: { marcaId: restaurante.marcaId, rol: 'OWNER' },
        orderBy: { usuario: { nombre: 'asc' } },
        select: MEMBRESIA_CON_USUARIO,
      }),
      this.prisma.membresia.findMany({
        where: { restauranteId },
        orderBy: [{ rol: 'asc' }, { usuario: { nombre: 'asc' } }],
        select: MEMBRESIA_CON_USUARIO,
      }),
      this.prisma.mozo.findMany({
        where: { restauranteId, usuarioId: null, activo: true },
        orderBy: { nombre: 'asc' },
        select: { id: true, nombre: true, email: true, esJefeSalon: true },
      }),
    ])

    return {
      duenos: duenos.map(comoMiembro),
      miembros: miembros.map(comoMiembro),
      sinCuenta: sinCuenta.map(({ id, ...mozo }) => ({ mozoId: id, ...mozo })),
    }
  }

  /**
   * Quita la membresía de alguien en el restaurante, con la misma regla que invitarlo: el OWNER a cualquiera; el GERENTE
   * a JEFE_SALON, MOZO y COCINA. Nadie se quita a sí mismo, y los dueños se quitan desde la consola de ROOT. A un MOZO o
   * JEFE_SALON también se le da de baja el `Mozo`; si lo vuelven a invitar, la invitación lo reactiva.
   */
  async quitarAcceso(restauranteId: string, membresiaId: string, usuario: UsuarioAutenticado): Promise<void> {
    const membresia = await this.prisma.membresia.findUnique({
      where: { id: membresiaId },
      select: { id: true, rol: true, usuarioId: true, restauranteId: true },
    })
    if (membresia?.restauranteId !== restauranteId) {
      throw new NotFoundException('Esa persona no tiene acceso a este restaurante')
    }
    if (membresia.usuarioId === usuario.id) throw new ForbiddenException('No podés quitarte el acceso a vos mismo')

    const roles = await this.acceso.exigirRol(usuario.id, restauranteId, ['OWNER', 'GERENTE'])
    if (!puedeInvitar({ esRoot: false, rolesEnAmbito: roles }, membresia.rol)) {
      throw new ForbiddenException('No podés quitarle el acceso a ese rol')
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membresia.delete({ where: { id: membresia.id } })
      if (membresia.rol === 'MOZO' || membresia.rol === 'JEFE_SALON') {
        await tx.mozo.updateMany({
          where: { restauranteId, usuarioId: membresia.usuarioId },
          data: { activo: false },
        })
      }
    })
  }
}
