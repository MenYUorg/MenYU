import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { derivarDescuento } from '../items/descuento.util'
import { MIN_CARACTERES_BUSQUEDA } from './dto/buscar-discovery.dto'
import { RESTAURANTE_DISPONIBLE } from '../common/restaurante-disponible'

// Límites duros: el listado y la búsqueda no se paginan, así que la respuesta siempre tiene tope.
export const MAX_RESTAURANTES = 50
export const MAX_OFERTAS = 30

// Un plato está en oferta si está disponible y tiene un precio con descuento.
const ITEM_EN_OFERTA = { disponible: true, precioDescuento: { not: null } } satisfies Prisma.ItemMenuWhereInput

// Solo se muestran restaurantes activos que pertenecen a marcas activas (la misma regla que el menú y la apertura de mesas).
const RESTAURANTE_VISIBLE = RESTAURANTE_DISPONIBLE

// Es un endpoint público: el `select` es explícito y nunca se devuelve una fila completa (el restaurante tiene los
// tokens de Mercado Pago, el modo de sesión, etc.).
const RESTAURANTE_SELECT = {
  id: true,
  nombre: true,
  direccion: true,
  logoUrl: true,
  marca: { select: { id: true, nombre: true, logoUrl: true } },
  _count: { select: { items: { where: ITEM_EN_OFERTA } } },
} satisfies Prisma.RestauranteSelect

const OFERTA_SELECT = {
  id: true,
  nombre: true,
  imagenUrl: true,
  precioBase: true,
  precioDescuento: true,
  restaurante: { select: { id: true, nombre: true } },
} satisfies Prisma.ItemMenuSelect

type RestauranteFila = Prisma.RestauranteGetPayload<{ select: typeof RESTAURANTE_SELECT }>
type OfertaFila = Prisma.ItemMenuGetPayload<{ select: typeof OFERTA_SELECT }>

/** Escapa `\`, `%` y `_` para que el texto buscado se compare como texto y no como comodines de LIKE. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)
}

function aRestaurante(r: RestauranteFila) {
  return {
    id: r.id,
    nombre: r.nombre,
    direccion: r.direccion,
    // El logo propio del restaurante manda; si no tiene, el de su marca.
    logoUrl: r.logoUrl ?? r.marca.logoUrl ?? null,
    marca: { id: r.marca.id, nombre: r.marca.nombre },
    cantidadOfertas: r._count.items,
  }
}

function aOferta(item: OfertaFila) {
  const precios = derivarDescuento(item.precioBase, item.precioDescuento)
  // Un descuento guardado que no es válido contra el precio base se ignora (ver derivarDescuento): no es una oferta.
  if (precios.precioDescuento == null || precios.porcentajeDescuento == null) return null
  return {
    id: item.id,
    nombre: item.nombre,
    imagenUrl: item.imagenUrl,
    precioBase: Number(item.precioBase),
    precioDescuento: precios.precioDescuento,
    porcentajeDescuento: precios.porcentajeDescuento,
    precioVigente: precios.precioVigente,
    restaurante: { id: item.restaurante.id, nombre: item.restaurante.nombre },
  }
}

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /discovery`: hasta 50 restaurantes por nombre y hasta 30 ofertas por porcentaje de descuento mayor.
   * No usa `unaccent`: el listado anda aunque la extensión no esté.
   */
  async getDiscovery() {
    const [restaurantes, idsOfertas] = await Promise.all([
      this.prisma.restaurante.findMany({
        where: RESTAURANTE_VISIBLE,
        select: RESTAURANTE_SELECT,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        take: MAX_RESTAURANTES,
      }),
      this.idsDeOfertas(),
    ])

    return {
      restaurantes: restaurantes.map(aRestaurante),
      ofertas: await this.cargarOfertas(idsOfertas),
    }
  }

  /**
   * `GET /discovery/restaurantes/:id`: un restaurante activo de una marca activa y sus ofertas (hasta 30, por
   * porcentaje mayor). Es lo que necesita la pantalla del restaurante al entrar por un link o al recargar, cuando
   * el listado no se cargó antes (y el restaurante puede ser el número 51). No usa `unaccent`.
   */
  async getRestaurante(id: string) {
    const [[restaurante], idsOfertas] = await Promise.all([
      this.cargarRestaurantes([id]),
      this.idsDeOfertasDelRestaurante(id),
    ])
    if (!restaurante) throw new NotFoundException('Restaurante no encontrado')

    return { restaurante, ofertas: await this.cargarOfertas(idsOfertas) }
  }

  /**
   * `GET /discovery/buscar?q=`: ignora mayúsculas y acentos (extensión `unaccent`) y busca "contiene".
   * Tres grupos, en el orden en que se muestran: las ofertas que coinciden, los restaurantes cuyo nombre (o el de su
   * marca) coincide y los restaurantes con platos que coinciden (sin repetir los del grupo anterior). Los restaurantes
   * de los dos grupos tienen la misma forma que en el listado: no se informa qué platos coincidieron.
   */
  async buscar(texto: string) {
    const q = texto.trim()
    // Se cuentan caracteres y no unidades de UTF-16: un emoji suelto es un solo carácter.
    if (Array.from(q).length < MIN_CARACTERES_BUSQUEDA) {
      throw new BadRequestException(`La búsqueda necesita al menos ${MIN_CARACTERES_BUSQUEDA} caracteres`)
    }
    const patron = `%${escaparLike(q)}%`

    // Primero se averiguan los ids (consultas con unaccent) y después se arman los datos con `select` explícito.
    const [idsOfertas, idsRestaurantes, idsConPlatos] = await Promise.all([
      this.idsDeOfertasQueCoinciden(patron),
      this.idsDeRestaurantesQueCoinciden(patron),
      this.idsDeRestaurantesConPlatosQueCoinciden(patron),
    ])

    const [ofertas, restaurantes, restaurantesConPlatos] = await Promise.all([
      this.cargarOfertas(idsOfertas),
      this.cargarRestaurantes(idsRestaurantes),
      this.cargarRestaurantes(idsConPlatos),
    ])

    return { ofertas, restaurantes, restaurantesConPlatos }
  }

  // ── Consultas de ids ────────────────────────────────────────────────────────────────────────────────────────

  /** Ofertas del listado: disponibles, de restaurantes y marcas activos, por porcentaje mayor (y nombre). */
  private async idsDeOfertas(): Promise<string[]> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT i.id
      FROM item_menu i
      JOIN restaurante r ON r.id = i.restaurante_id
      JOIN marca m ON m.id = r.marca_id
      WHERE i.disponible = true
        AND i.precio_descuento IS NOT NULL
        AND r.activo = true
        AND m.activo = true
      ORDER BY (i.precio_base - i.precio_descuento) / i.precio_base DESC, i.nombre ASC, i.id ASC
      LIMIT ${MAX_OFERTAS}`
    return filas.map((fila) => fila.id)
  }

  /** Ofertas de un restaurante, por porcentaje mayor (y nombre). Si el restaurante o su marca no están activos, ninguna. */
  private async idsDeOfertasDelRestaurante(restauranteId: string): Promise<string[]> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT i.id
      FROM item_menu i
      JOIN restaurante r ON r.id = i.restaurante_id
      JOIN marca m ON m.id = r.marca_id
      WHERE i.restaurante_id = ${restauranteId}::text
        AND i.disponible = true
        AND i.precio_descuento IS NOT NULL
        AND r.activo = true
        AND m.activo = true
      ORDER BY (i.precio_base - i.precio_descuento) / i.precio_base DESC, i.nombre ASC, i.id ASC
      LIMIT ${MAX_OFERTAS}`
    return filas.map((fila) => fila.id)
  }

  private async idsDeOfertasQueCoinciden(patron: string): Promise<string[]> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT i.id
      FROM item_menu i
      JOIN restaurante r ON r.id = i.restaurante_id
      JOIN marca m ON m.id = r.marca_id
      WHERE i.disponible = true
        AND i.precio_descuento IS NOT NULL
        AND r.activo = true
        AND m.activo = true
        AND unaccent(i.nombre) ILIKE unaccent(${patron}::text)
      ORDER BY (i.precio_base - i.precio_descuento) / i.precio_base DESC, i.nombre ASC, i.id ASC
      LIMIT ${MAX_OFERTAS}`
    return filas.map((fila) => fila.id)
  }

  /** Restaurantes activos cuyo nombre, o el de su marca, contiene el texto. */
  private async idsDeRestaurantesQueCoinciden(patron: string): Promise<string[]> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT r.id
      FROM restaurante r
      JOIN marca m ON m.id = r.marca_id
      WHERE r.activo = true
        AND m.activo = true
        AND (unaccent(r.nombre) ILIKE unaccent(${patron}::text) OR unaccent(m.nombre) ILIKE unaccent(${patron}::text))
      ORDER BY r.nombre ASC, r.id ASC
      LIMIT ${MAX_RESTAURANTES}`
    return filas.map((fila) => fila.id)
  }

  /**
   * Restaurantes activos que tienen algún plato disponible que contiene el texto, sin los que ya coinciden por
   * nombre (esos van en el otro grupo). Solo importa que haya al menos un plato: no se informa cuáles ni cuántos.
   */
  private async idsDeRestaurantesConPlatosQueCoinciden(patron: string): Promise<string[]> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT r.id
      FROM restaurante r
      JOIN marca m ON m.id = r.marca_id
      WHERE r.activo = true
        AND m.activo = true
        AND NOT (unaccent(r.nombre) ILIKE unaccent(${patron}::text) OR unaccent(m.nombre) ILIKE unaccent(${patron}::text))
        AND EXISTS (
          SELECT 1
          FROM item_menu i
          WHERE i.restaurante_id = r.id
            AND i.disponible = true
            AND unaccent(i.nombre) ILIKE unaccent(${patron}::text)
        )
      ORDER BY r.nombre ASC, r.id ASC
      LIMIT ${MAX_RESTAURANTES}`
    return filas.map((fila) => fila.id)
  }

  // ── Armado de los datos ─────────────────────────────────────────────────────────────────────────────────────

  /** Restaurantes en el mismo orden que `ids` (la base ya los ordenó). */
  private async cargarRestaurantes(ids: string[]) {
    if (ids.length === 0) return []
    const filas = await this.prisma.restaurante.findMany({
      where: { id: { in: ids }, ...RESTAURANTE_VISIBLE },
      select: RESTAURANTE_SELECT,
    })
    const porId = new Map(filas.map((fila) => [fila.id, fila]))
    return ids.flatMap((id) => {
      const fila = porId.get(id)
      return fila ? [aRestaurante(fila)] : []
    })
  }

  /** Ofertas en el mismo orden que `ids` (el de porcentaje mayor). */
  private async cargarOfertas(ids: string[]) {
    if (ids.length === 0) return []
    const filas = await this.prisma.itemMenu.findMany({
      where: { id: { in: ids }, ...ITEM_EN_OFERTA },
      select: OFERTA_SELECT,
    })
    const porId = new Map(filas.map((fila) => [fila.id, fila]))
    return ids.flatMap((id) => {
      const fila = porId.get(id)
      const oferta = fila ? aOferta(fila) : null
      return oferta ? [oferta] : []
    })
  }
}
