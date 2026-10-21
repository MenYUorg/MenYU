import { ForbiddenException, Injectable } from '@nestjs/common'
import { Prisma, Rol } from '@prisma/client'
import { RESTAURANTE_DISPONIBLE } from '../../common/restaurante-disponible'
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
    restaurante: { id: string; nombre: string; marcaId: string; marca: { id: string; nombre: string } } | null
  }[]
}

/** El perfil operativo de mozo de un usuario en un restaurante (asignaciones, llamados, cobros). */
export interface MozoDelUsuario {
  id: string
  nombre: string
  esJefeSalon: boolean
}

const SIN_PERMISO = 'No tenés permiso para esta acción'
const TODOS_LOS_ROLES: readonly Rol[] = Object.values(Rol)

/**
 * Qué puede hacer un usuario según sus membresías. Es el único lugar que lo decide: guards y services
 * le preguntan acá. Ignora `esRoot`: ROOT no es un bypass (ver CLAUDE.md).
 *
 * Baja efectiva: una membresía cuenta solo mientras su restaurante y la marca estén activos
 * (`RESTAURANTE_DISPONIBLE`). Al reactivarlos, vuelve a contar.
 */
@Injectable()
export class AccesoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roles del usuario en el restaurante: el de su membresía en ese restaurante y OWNER si lo es de la
   * marca, que cubre todas sus sucursales. Vacío si no tiene ninguno, o si el restaurante no existe o
   * está dado de baja (él o su marca).
   */
  async rolesEnRestaurante(usuarioId: string, restauranteId: string): Promise<Rol[]> {
    const restaurante = await this.prisma.restaurante.findFirst({
      where: { id: restauranteId, ...RESTAURANTE_DISPONIBLE },
      select: { marcaId: true },
    })
    if (!restaurante) return []

    const membresias = await this.prisma.membresia.findMany({
      where: { usuarioId, OR: [{ restauranteId }, { rol: 'OWNER', marcaId: restaurante.marcaId }] },
      select: { rol: true },
    })
    return membresias.map((m) => m.rol)
  }

  /** Si es OWNER de la marca y la marca está activa. */
  async esOwnerDeMarca(usuarioId: string, marcaId: string): Promise<boolean> {
    const membresia = await this.prisma.membresia.findFirst({
      where: { usuarioId, marcaId, rol: 'OWNER', marca: { activo: true } },
      select: { id: true },
    })
    return membresia !== null
  }

  /**
   * 403 si el usuario no tiene ninguno de `roles` en el restaurante. Si tiene alguno, devuelve todos
   * sus roles ahí (por ejemplo, para distinguir al MOZO del GERENTE). Para las rutas de un recurso
   * (`/items/:id`), donde el service resuelve el restaurante.
   */
  async exigirRol(usuarioId: string, restauranteId: string, roles: readonly Rol[]): Promise<Rol[]> {
    const suyos = await this.rolesEnRestaurante(usuarioId, restauranteId)
    if (!suyos.some((rol) => roles.includes(rol))) throw new ForbiddenException(SIN_PERMISO)
    return suyos
  }

  /** 403 si no es OWNER de la marca o la marca está dada de baja. */
  async exigirOwnerDeMarca(usuarioId: string, marcaId: string): Promise<void> {
    if (!(await this.esOwnerDeMarca(usuarioId, marcaId))) throw new ForbiddenException(SIN_PERMISO)
  }

  /**
   * Si tiene alguno de `roles` en algún lugar: una membresía OWNER de una marca activa o una de
   * restaurante en uno disponible. Para las rutas que no son de un restaurante (los listados y el
   * catálogo global de clasificaciones).
   */
  async tieneAlgunRol(usuarioId: string, roles: readonly Rol[]): Promise<boolean> {
    const rolesDeRestaurante = roles.filter((rol) => rol !== 'OWNER')
    const alcance: Prisma.MembresiaWhereInput[] = []
    if (rolesDeRestaurante.length > 0) {
      alcance.push({ rol: { in: rolesDeRestaurante }, restaurante: RESTAURANTE_DISPONIBLE })
    }
    if (roles.includes('OWNER')) alcance.push({ rol: 'OWNER', marca: { activo: true } })
    if (alcance.length === 0) return false

    const membresia = await this.prisma.membresia.findFirst({ where: { usuarioId, OR: alcance }, select: { id: true } })
    return membresia !== null
  }

  /** 403 si no tiene ninguno de `roles` en ningún lugar (ver `tieneAlgunRol`). */
  async exigirAlgunRol(usuarioId: string, roles: readonly Rol[]): Promise<void> {
    if (!(await this.tieneAlgunRol(usuarioId, roles))) throw new ForbiddenException(SIN_PERMISO)
  }

  /**
   * El `Mozo` del usuario en el restaurante, solo si está activo. Es la identidad de quien atiende un
   * llamado o cobra: sale de acá, nunca del body. No decide permisos (para eso, `exigirRol`).
   */
  async mozoDe(usuarioId: string, restauranteId: string): Promise<MozoDelUsuario | null> {
    const mozo = await this.prisma.mozo.findUnique({
      where: { usuarioId_restauranteId: { usuarioId, restauranteId } },
      select: { id: true, nombre: true, esJefeSalon: true, activo: true },
    })
    if (!mozo?.activo) return null
    const { activo: _activo, ...datos } = mozo
    return datos
  }

  /**
   * Ids de los restaurantes disponibles en los que el usuario tiene alguno de `roles` (por defecto,
   * cualquiera), ordenados por nombre. Con OWNER, todos los de las marcas de las que es dueño.
   */
  async restaurantesDe(usuarioId: string, roles: readonly Rol[] = TODOS_LOS_ROLES): Promise<string[]> {
    const rolesDeRestaurante = roles.filter((rol) => rol !== 'OWNER')
    const alcance: Prisma.RestauranteWhereInput[] = []
    if (rolesDeRestaurante.length > 0) {
      alcance.push({ membresias: { some: { usuarioId, rol: { in: rolesDeRestaurante } } } })
    }
    if (roles.includes('OWNER')) {
      alcance.push({ marca: { membresias: { some: { usuarioId, rol: 'OWNER' } } } })
    }
    if (alcance.length === 0) return []

    const restaurantes = await this.prisma.restaurante.findMany({
      where: { ...RESTAURANTE_DISPONIBLE, OR: alcance },
      orderBy: { nombre: 'asc' },
      select: { id: true },
    })
    return restaurantes.map((r) => r.id)
  }

  /** El perfil de `GET /auth/me`. Omite las membresías de marcas o restaurantes dados de baja. */
  async perfil(usuario: UsuarioAutenticado): Promise<PerfilUsuario> {
    const membresias = await this.prisma.membresia.findMany({
      where: { usuarioId: usuario.id, OR: [{ marca: { activo: true } }, { restaurante: RESTAURANTE_DISPONIBLE }] },
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
        restaurante: {
          select: { id: true, nombre: true, marcaId: true, marca: { select: { id: true, nombre: true } } },
        },
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
