import { Injectable } from '@nestjs/common'
import { Rol } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { UsuarioAutenticado } from './usuario-autenticado'

/** Respuesta de `GET /auth/me`. Misma forma que `PerfilUsuario` de `@menyu/types`. */
export interface PerfilUsuario {
  id: string
  email: string
  nombre: string
  esRoot: boolean
  membresias: {
    id: string
    rol: Rol
    marca: { id: string; nombre: string; restaurantes: { id: string; nombre: string }[] } | null
    restaurante: { id: string; nombre: string; marcaId: string } | null
  }[]
}

/**
 * Qué puede hacer un usuario según sus membresías. Es el único lugar que lo decide: guards y services
 * le preguntan acá. Ignora `esRoot`: ROOT no es un bypass (ver CLAUDE.md).
 */
@Injectable()
export class AccesoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roles del usuario en el restaurante: el de su membresía en ese restaurante y OWNER si lo es de la
   * marca, que cubre todas sus sucursales. Vacío si no tiene ninguno o el restaurante no existe.
   */
  async rolesEnRestaurante(usuarioId: string, restauranteId: string): Promise<Rol[]> {
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: { marcaId: true },
    })
    if (!restaurante) return []

    const membresias = await this.prisma.membresia.findMany({
      where: { usuarioId, OR: [{ restauranteId }, { rol: 'OWNER', marcaId: restaurante.marcaId }] },
      select: { rol: true },
    })
    return membresias.map((m) => m.rol)
  }

  async esOwnerDeMarca(usuarioId: string, marcaId: string): Promise<boolean> {
    const membresia = await this.prisma.membresia.findFirst({
      where: { usuarioId, marcaId, rol: 'OWNER' },
      select: { id: true },
    })
    return membresia !== null
  }

  async perfil(usuario: UsuarioAutenticado): Promise<PerfilUsuario> {
    const membresias = await this.prisma.membresia.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        rol: true,
        marca: {
          select: {
            id: true,
            nombre: true,
            restaurantes: {
              where: { activo: true },
              orderBy: { nombre: 'asc' },
              select: { id: true, nombre: true },
            },
          },
        },
        restaurante: { select: { id: true, nombre: true, marcaId: true } },
      },
    })
    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      esRoot: usuario.esRoot,
      membresias,
    }
  }
}
