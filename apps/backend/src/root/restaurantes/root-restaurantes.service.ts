import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { JwtPayload } from '../../auth/auth.service'
import { PrismaService } from '../../prisma/prisma.service'
import { HistorialRootService } from '../historial/historial-root.service'
import { CrearRestauranteRootDto, EditarRestauranteRootDto } from '../marcas/dto/marca-root.dto'
import { RootRestaurante } from '../root.types'

// Lo único que ROOT ve de un restaurante. La dirección es de solo lectura; el logo, el modo de sesión, las mesas, el menú y los
// datos de Mercado Pago (`mp_*`) no salen nunca.
const SELECT_RESTAURANTE = {
  id: true,
  nombre: true,
  direccion: true,
  activo: true,
  marca: { select: { id: true, nombre: true } },
} satisfies Prisma.RestauranteSelect

type FilaRestaurante = Prisma.RestauranteGetPayload<{ select: typeof SELECT_RESTAURANTE }>

const aRestaurante = (fila: FilaRestaurante): RootRestaurante => ({
  id: fila.id,
  nombre: fila.nombre,
  direccion: fila.direccion,
  activo: fila.activo,
})

/**
 * Restaurantes que administra ROOT: crear dentro de una marca, cambiar el nombre y dar de baja o reactivar. La dirección la carga
 * ROOT UNA sola vez, al crearlo (hoy es obligatoria); después solo la cambia el dueño. Mover un restaurante a otra marca no existe.
 */
@Injectable()
export class RootRestaurantesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historial: HistorialRootService,
  ) {}

  async crear(marcaId: string, dto: CrearRestauranteRootDto, user: JwtPayload): Promise<RootRestaurante> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, user)
      const marca = await tx.marca.findUnique({ where: { id: marcaId }, select: { id: true, nombre: true, activo: true } })
      if (!marca) throw new NotFoundException('Marca no encontrada')
      if (!marca.activo) throw new ConflictException('La marca está dada de baja: no se le pueden crear restaurantes')

      const creado = await tx.restaurante.create({
        data: { marcaId: marca.id, nombre: dto.nombre, direccion: dto.direccion },
        select: SELECT_RESTAURANTE,
      })

      await this.historial.registrar(tx, {
        actor,
        accion: 'RESTAURANTE_CREAR',
        entidad: { tipo: 'RESTAURANTE', id: creado.id, nombre: creado.nombre },
        marca: { id: marca.id, nombre: marca.nombre },
        cambios: [
          { campo: 'Nombre', antes: null, despues: creado.nombre },
          { campo: 'Dirección', antes: null, despues: dto.direccion },
        ],
      })
      return aRestaurante(creado)
    })
  }

  async editar(id: string, dto: EditarRestauranteRootDto, user: JwtPayload): Promise<RootRestaurante> {
    if (dto.nombre === undefined) throw new BadRequestException('No hay nada para cambiar: mandá el nombre')
    const nombre = dto.nombre

    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, user)
      const restaurante = await tx.restaurante.findUnique({ where: { id }, select: SELECT_RESTAURANTE })
      if (!restaurante) throw new NotFoundException('Restaurante no encontrado')
      // El mismo nombre: no hay nada que cambiar ni que registrar.
      if (restaurante.nombre === nombre) return aRestaurante(restaurante)

      const actualizado = await tx.restaurante.update({ where: { id }, data: { nombre }, select: SELECT_RESTAURANTE })

      await this.historial.registrar(tx, {
        actor,
        accion: 'RESTAURANTE_EDITAR',
        entidad: { tipo: 'RESTAURANTE', id, nombre: actualizado.nombre },
        marca: { id: restaurante.marca.id, nombre: restaurante.marca.nombre },
        cambios: [{ campo: 'Nombre', antes: restaurante.nombre, despues: actualizado.nombre }],
      })
      return aRestaurante(actualizado)
    })
  }

  /**
   * Da de baja (`activo = false`) o reactiva un restaurante. Idempotente. Cada restaurante conserva su propio estado: reactivar
   * uno de una marca dada de baja es válido (sigue sin estar disponible mientras la marca lo esté, cuando la baja tenga efecto).
   */
  async cambiarEstado(id: string, activo: boolean, user: JwtPayload): Promise<RootRestaurante> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, user)
      const restaurante = await tx.restaurante.findUnique({ where: { id }, select: SELECT_RESTAURANTE })
      if (!restaurante) throw new NotFoundException('Restaurante no encontrado')
      if (restaurante.activo === activo) return aRestaurante(restaurante)

      const actualizado = await tx.restaurante.update({ where: { id }, data: { activo }, select: SELECT_RESTAURANTE })

      await this.historial.registrar(tx, {
        actor,
        accion: activo ? 'RESTAURANTE_REACTIVAR' : 'RESTAURANTE_BAJA',
        entidad: { tipo: 'RESTAURANTE', id, nombre: restaurante.nombre },
        marca: { id: restaurante.marca.id, nombre: restaurante.marca.nombre },
        cambios: [{ campo: 'Estado', antes: activo ? 'De baja' : 'Activo', despues: activo ? 'Activo' : 'De baja' }],
      })
      return aRestaurante(actualizado)
    })
  }
}
