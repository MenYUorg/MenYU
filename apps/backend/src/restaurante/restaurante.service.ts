import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { LogosService } from '../storage/logos.service'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { MARCA_SELECT } from '../marca/marca.service'
import { UpdateRestauranteDto } from './dto/update-restaurante.dto'
import { RESTAURANTE_SELECT } from './restaurante.select'

/** Un restaurante con su marca, como lo listan web-admin y su contexto. */
export const RESTAURANTE_CON_MARCA_SELECT = {
  ...RESTAURANTE_SELECT,
  marca: { select: MARCA_SELECT },
} satisfies Prisma.RestauranteSelect

// Los ítems del menú no se incluyen acá: se piden con GET /items?restauranteId=. Los mozos, sin la contraseña.
export const RESTAURANTE_DETALLE_SELECT = {
  ...RESTAURANTE_CON_MARCA_SELECT,
  mozos: {
    where: { activo: true },
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, email: true, telefono: true, esJefeSalon: true, usuarioId: true },
  },
  comandas: true,
  categorias: true,
  menus: true,
  mesas: true,
  ingredientes: true,
} satisfies Prisma.RestauranteSelect

const SOLO_EL_OWNER = 'Solo el owner de la marca puede cambiar la dirección y el nombre de la sección de recomendados'

@Injectable()
export class RestauranteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logos: LogosService,
    private readonly acceso: AccesoService,
  ) {}

  /** Los restaurantes disponibles de los que el usuario es OWNER (por la marca) o GERENTE. 403 si no es ninguno. */
  async findAll(usuario: UsuarioAutenticado) {
    await this.acceso.exigirAlgunRol(usuario.id, ADMINISTRACION)
    const ids = await this.acceso.restaurantesDe(usuario.id, ADMINISTRACION)
    return this.prisma.restaurante.findMany({
      where: { id: { in: ids } },
      orderBy: { nombre: 'asc' },
      select: RESTAURANTE_CON_MARCA_SELECT,
    })
  }

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async findOne(id: string) {
    const restaurante = await this.prisma.restaurante.findUnique({ where: { id }, select: RESTAURANTE_DETALLE_SELECT })
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado')
    return restaurante
  }

  /** OWNER o GERENTE lo exige la ruta; la dirección y el nombre de la sección de recomendados, solo el OWNER. */
  async update(id: string, dto: UpdateRestauranteDto, usuario: UsuarioAutenticado) {
    if (dto.direccion !== undefined || dto.nombreSeccionRecomendados !== undefined) {
      const roles = await this.acceso.rolesEnRestaurante(usuario.id, id)
      if (!roles.includes('OWNER')) throw new ForbiddenException(SOLO_EL_OWNER)
    }
    return this.prisma.restaurante.update({ where: { id }, data: dto, select: RESTAURANTE_SELECT })
  }

  // ── Logo (solo el OWNER de la marca, lo exige la ruta) ─────────────────

  async uploadLogo(id: string, file: Express.Multer.File) {
    const logoUrl = await this.logos.subir('restaurantes', id, file)
    return this.prisma.restaurante.update({
      where: { id },
      data: { logoUrl },
      select: { id: true, logoUrl: true },
    })
  }

  async removeLogo(id: string) {
    const restaurante = await this.prisma.restaurante.findUnique({ where: { id }, select: { logoUrl: true } })
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado')
    if (!restaurante.logoUrl) throw new NotFoundException('Este restaurante no tiene logo propio')

    await this.logos.eliminar('restaurantes', id)
    return this.prisma.restaurante.update({
      where: { id },
      data: { logoUrl: null },
      select: { id: true, logoUrl: true },
    })
  }
}
