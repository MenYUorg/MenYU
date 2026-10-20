import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { JwtPayload } from '../../auth/auth.service'
import { PrismaService } from '../../prisma/prisma.service'
import { HistorialRootService } from '../historial/historial-root.service'
import { CambioHistorial } from '../historial/registrar-historial'
import { RootMarcaDetalle, RootMarcaResumen } from '../root.types'
import { CrearMarcaRootDto, EditarMarcaRootDto, ListarMarcasDto } from './dto/marca-root.dto'

export const MENSAJE_SLUG_EN_USO = 'Ya hay una marca con ese identificador (también cuentan las dadas de baja)'

// Lo único que ROOT ve de una marca en la lista: identidad, estado y cantidades. Nada de logos, menú, mesas, mozos ni pedidos.
const SELECT_RESUMEN = {
  id: true,
  nombre: true,
  slug: true,
  activo: true,
  restaurantes: { select: { activo: true } },
  admins: { where: { rol: 'OWNER' }, select: { id: true } },
} satisfies Prisma.MarcaSelect

// Y en el detalle: sus restaurantes (con la dirección de solo lectura) y sus dueños.
const SELECT_DETALLE = {
  id: true,
  nombre: true,
  slug: true,
  activo: true,
  restaurantes: { select: { id: true, nombre: true, direccion: true, activo: true }, orderBy: [{ nombre: 'asc' as const }, { id: 'asc' as const }] },
  admins: { where: { rol: 'OWNER' }, select: { id: true, email: true, debeCambiarPassword: true }, orderBy: { email: 'asc' as const } },
} satisfies Prisma.MarcaSelect

type FilaResumen = Prisma.MarcaGetPayload<{ select: typeof SELECT_RESUMEN }>
type FilaDetalle = Prisma.MarcaGetPayload<{ select: typeof SELECT_DETALLE }>

function aResumen(fila: FilaResumen): RootMarcaResumen {
  return {
    id: fila.id,
    nombre: fila.nombre,
    slug: fila.slug,
    activo: fila.activo,
    restaurantes: { activos: fila.restaurantes.filter((r) => r.activo).length, total: fila.restaurantes.length },
    duenos: fila.admins.length,
  }
}

function aDetalle(fila: FilaDetalle): RootMarcaDetalle {
  return {
    id: fila.id,
    nombre: fila.nombre,
    slug: fila.slug,
    activo: fila.activo,
    restaurantes: fila.restaurantes.map((r) => ({ id: r.id, nombre: r.nombre, direccion: r.direccion, activo: r.activo })),
    duenos: fila.admins.map((a) => ({ id: a.id, email: a.email, debeCambiarPassword: a.debeCambiarPassword })),
  }
}

/** El detalle de una marca, leído con el cliente que se le pase (el de la transacción, si recién se cambió algo). */
async function leerDetalle(db: Pick<Prisma.TransactionClient, 'marca'>, id: string): Promise<RootMarcaDetalle> {
  const fila = await db.marca.findUnique({ where: { id }, select: SELECT_DETALLE })
  if (!fila) throw new NotFoundException('Marca no encontrada')
  return aDetalle(fila)
}

/**
 * Marcas que administra ROOT: ver, crear, cambiar el nombre y el identificador, y dar de baja o reactivar. Una baja es lógica y
 * reversible (`activo = false`): no se borra ninguna fila. En esta etapa todavía no corta nada fuera de Discovery (etapa 3).
 */
@Injectable()
export class RootMarcasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historial: HistorialRootService,
  ) {}

  async listar({ bajas }: ListarMarcasDto): Promise<RootMarcaResumen[]> {
    const filas = await this.prisma.marca.findMany({
      where: bajas ? {} : { activo: true },
      select: SELECT_RESUMEN,
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    })
    return filas.map(aResumen)
  }

  detalle(id: string): Promise<RootMarcaDetalle> {
    return leerDetalle(this.prisma, id)
  }

  async crear(dto: CrearMarcaRootDto, user: JwtPayload): Promise<RootMarcaDetalle> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, user)
      await this.exigirSlugLibre(tx, dto.slug)

      const creada = await this.conConflictoDeSlug(() =>
        tx.marca.create({ data: { nombre: dto.nombre, slug: dto.slug }, select: { id: true, nombre: true, slug: true } }),
      )

      await this.historial.registrar(tx, {
        actor,
        accion: 'MARCA_CREAR',
        entidad: { tipo: 'MARCA', id: creada.id, nombre: creada.nombre },
        cambios: [
          { campo: 'Nombre', antes: null, despues: creada.nombre },
          { campo: 'Identificador', antes: null, despues: creada.slug },
        ],
      })
      return leerDetalle(tx, creada.id)
    })
  }

  async editar(id: string, dto: EditarMarcaRootDto, user: JwtPayload): Promise<RootMarcaDetalle> {
    if (dto.nombre === undefined && dto.slug === undefined) {
      throw new BadRequestException('No hay nada para cambiar: mandá el nombre, el identificador (slug) o los dos')
    }
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, user)
      const marca = await tx.marca.findUnique({ where: { id }, select: { id: true, nombre: true, slug: true } })
      if (!marca) throw new NotFoundException('Marca no encontrada')

      // Solo lo que de verdad cambia: lo que llega igual a lo que ya hay no se escribe ni se registra.
      const cambios: CambioHistorial[] = []
      const data: Prisma.MarcaUpdateInput = {}
      if (dto.nombre !== undefined && dto.nombre !== marca.nombre) {
        cambios.push({ campo: 'Nombre', antes: marca.nombre, despues: dto.nombre })
        data.nombre = dto.nombre
      }
      if (dto.slug !== undefined && dto.slug !== marca.slug) {
        cambios.push({ campo: 'Identificador', antes: marca.slug, despues: dto.slug })
        data.slug = dto.slug
      }
      if (!cambios.length) return leerDetalle(tx, id)

      if (data.slug) await this.exigirSlugLibre(tx, dto.slug as string, id)
      const actualizada = await this.conConflictoDeSlug(() =>
        tx.marca.update({ where: { id }, data, select: { id: true, nombre: true } }),
      )

      await this.historial.registrar(tx, {
        actor,
        accion: 'MARCA_EDITAR',
        entidad: { tipo: 'MARCA', id, nombre: actualizada.nombre },
        cambios,
      })
      return leerDetalle(tx, id)
    })
  }

  /** Da de baja (`activo = false`) o reactiva una marca. Idempotente: si ya está en ese estado no cambia nada ni se registra. */
  async cambiarEstado(id: string, activo: boolean, user: JwtPayload): Promise<RootMarcaDetalle> {
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, user)
      const marca = await tx.marca.findUnique({ where: { id }, select: { id: true, nombre: true, activo: true } })
      if (!marca) throw new NotFoundException('Marca no encontrada')
      if (marca.activo === activo) return leerDetalle(tx, id)

      await tx.marca.update({ where: { id }, data: { activo }, select: { id: true } })

      await this.historial.registrar(tx, {
        actor,
        accion: activo ? 'MARCA_REACTIVAR' : 'MARCA_BAJA',
        entidad: { tipo: 'MARCA', id, nombre: marca.nombre },
        cambios: [{ campo: 'Estado', antes: activo ? 'De baja' : 'Activa', despues: activo ? 'Activa' : 'De baja' }],
      })
      return leerDetalle(tx, id)
    })
  }

  /** 409 si otra marca (también de baja) ya usa el identificador. */
  private async exigirSlugLibre(tx: Pick<Prisma.TransactionClient, 'marca'>, slug: string, excluirMarcaId?: string): Promise<void> {
    const otra = await tx.marca.findFirst({
      where: { slug, ...(excluirMarcaId ? { id: { not: excluirMarcaId } } : {}) },
      select: { id: true },
    })
    if (otra) throw new ConflictException(MENSAJE_SLUG_EN_USO)
  }

  /** Si dos pedidos eligen el mismo identificador a la vez, el segundo choca con la clave única: 409 y no 500. */
  private async conConflictoDeSlug<T>(escritura: () => Promise<T>): Promise<T> {
    try {
      return await escritura()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(MENSAJE_SLUG_EN_USO)
      throw error
    }
  }
}
