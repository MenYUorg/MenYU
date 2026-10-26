import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { LogosService } from '../storage/logos.service'
import { RESTAURANTE_DISPONIBLE } from '../common/restaurante-disponible'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { RESTAURANTE_SELECT } from '../restaurante/restaurante.select'
import { UpdateMarcaDto } from './dto/update-marca.dto'

/** Las columnas de una marca que ve su dueño. */
export const MARCA_SELECT = {
  id: true,
  nombre: true,
  slug: true,
  logoUrl: true,
  activo: true,
  createdAt: true,
} satisfies Prisma.MarcaSelect

/** Una marca con sus sucursales activas (sin las columnas de Mercado Pago de cada una). */
export const MARCA_CON_RESTAURANTES_SELECT = {
  ...MARCA_SELECT,
  restaurantes: { where: { activo: true }, orderBy: { nombre: 'asc' }, select: RESTAURANTE_SELECT },
} satisfies Prisma.MarcaSelect

// Los ítems pertenecen a cada restaurante, no a la marca: se piden con GET /items?restauranteId=. El personal,
// con GET /restaurantes/:restauranteId/personal.
export const MARCA_DETALLE_SELECT = {
  ...MARCA_SELECT,
  restaurantes: {
    where: { activo: true },
    orderBy: { nombre: 'asc' },
    select: {
      ...RESTAURANTE_SELECT,
      mozos: { where: { activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, email: true } },
      mesas: true,
    },
  },
} satisfies Prisma.MarcaSelect

@Injectable()
export class MarcaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logos: LogosService,
    private readonly acceso: AccesoService,
  ) {}

  /** Público. Una marca dada de baja no muestra sus restaurantes (aunque cada uno siga activo): vuelve todo al reactivarla. */
  async findRestaurantesByMarca(marcaId: string) {
    return this.prisma.restaurante.findMany({
      where: { marcaId, ...RESTAURANTE_DISPONIBLE },
      select: { id: true, nombre: true, direccion: true },
      orderBy: { nombre: 'asc' },
    })
  }

  async findAllPublicas() {
    const marcas = await this.prisma.marca.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        _count: {
          select: { restaurantes: { where: { activo: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
    })
    return marcas.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      restaurantesActivos: m._count.restaurantes,
    }))
  }

  /** Las marcas activas de las que el usuario es OWNER. 403 si no es OWNER de ninguna. */
  async findAll(usuario: UsuarioAutenticado) {
    await this.acceso.exigirAlgunRol(usuario.id, ['OWNER'])
    return this.prisma.marca.findMany({
      where: { activo: true, membresias: { some: { usuarioId: usuario.id, rol: 'OWNER' } } },
      orderBy: { nombre: 'asc' },
      select: MARCA_CON_RESTAURANTES_SELECT,
    })
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    await this.acceso.exigirOwnerDeMarca(usuario.id, id)
    const marca = await this.prisma.marca.findUnique({ where: { id }, select: MARCA_DETALLE_SELECT })
    if (!marca) throw new NotFoundException('Marca no encontrada')
    return marca
  }

  async update(id: string, dto: UpdateMarcaDto, usuario: UsuarioAutenticado) {
    await this.acceso.exigirOwnerDeMarca(usuario.id, id)
    if (dto.slug) {
      const conflict = await this.prisma.marca.findFirst({
        where: { slug: dto.slug, id: { not: id } },
      })
      if (conflict) throw new ConflictException('Ya existe una marca con ese slug')
    }
    return this.prisma.marca.update({ where: { id }, data: dto, select: MARCA_SELECT })
  }

  // ── Logo (solo el OWNER de la marca) ──────────────────────────────────

  async uploadLogo(id: string, file: Express.Multer.File, usuario: UsuarioAutenticado) {
    await this.acceso.exigirOwnerDeMarca(usuario.id, id)

    const logoUrl = await this.logos.subir('marcas', id, file)
    return this.prisma.marca.update({
      where: { id },
      data: { logoUrl },
      select: { id: true, logoUrl: true },
    })
  }

  async removeLogo(id: string, usuario: UsuarioAutenticado) {
    await this.acceso.exigirOwnerDeMarca(usuario.id, id)

    const marca = await this.prisma.marca.findUnique({ where: { id }, select: { logoUrl: true } })
    if (!marca) throw new NotFoundException('Marca no encontrada')
    if (!marca.logoUrl) throw new NotFoundException('Esta marca no tiene logo')

    await this.logos.eliminar('marcas', id)
    return this.prisma.marca.update({
      where: { id },
      data: { logoUrl: null },
      select: { id: true, logoUrl: true },
    })
  }
}
