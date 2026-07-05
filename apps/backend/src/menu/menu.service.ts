import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface MenuFiltros {
  categoriaId?: string
  buscar?: string
  dieta?: string[]
  evitarAlergenos?: boolean
}

const ITEM_INCLUDE = {
  ingredientes: {
    include: { ingrediente: true },
    orderBy: [
      { esOriginal: 'desc' as const },
      { ingrediente: { nombre: 'asc' as const } },
    ] as { esOriginal?: 'asc' | 'desc'; ingrediente?: { nombre?: 'asc' | 'desc' } }[],
  },
  clasificaciones: {
    include: { clasificacion: true as const },
  },
}

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenuPublico(restauranteId: string, filtros: MenuFiltros) {
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: { id: true, nombre: true, activo: true, nombreSeccionRecomendados: true },
    })
    if (!restaurante || !restaurante.activo) throw new NotFoundException('Restaurante no encontrado')

    const buscarWhere = filtros.buscar
      ? { nombre: { contains: filtros.buscar, mode: 'insensitive' as const } }
      : {}

    const categorias = await this.prisma.categoriaMenu.findMany({
      where: {
        restauranteId,
        ...(filtros.categoriaId ? { id: filtros.categoriaId } : {}),
      },
      orderBy: { orden: 'asc' },
      include: {
        items: {
          where: { disponible: true, ...buscarWhere },
          include: ITEM_INCLUDE,
          orderBy: { nombre: 'asc' },
        },
      },
    })

    const result = categorias
      .map((cat) => ({
        id: cat.id,
        nombre: cat.nombre,
        orden: cat.orden,
        itemsDirectos: cat.items
          .filter((item) => this.pasaFiltros(item, filtros))
          .map((item) => this.serializeItem(item)),
      }))
      .filter((cat) => cat.itemsDirectos.length > 0)

    const recomendadosRaw = await this.prisma.itemMenu.findMany({
      where: { restauranteId, disponible: true, recomendadoEn: { not: null }, ...buscarWhere },
      orderBy: { nombre: 'asc' },
      include: { ...ITEM_INCLUDE, categoria: { select: { orden: true } } },
    })

    const recomendados = recomendadosRaw
      .filter((item) => this.pasaFiltros(item, filtros))
      .sort((a, b) => {
        const ordenA = a.categoria?.orden ?? Number.MAX_SAFE_INTEGER
        const ordenB = b.categoria?.orden ?? Number.MAX_SAFE_INTEGER
        if (ordenA !== ordenB) return ordenA - ordenB
        return a.nombre.localeCompare(b.nombre)
      })
      .map((item) => ({ ...this.serializeItem(item), esRecomendado: true }))

    return {
      restaurante: {
        id: restaurante.id,
        nombre: restaurante.nombre,
        nombreSeccionRecomendados: restaurante.nombreSeccionRecomendados,
      },
      categorias: result,
      recomendados,
    }
  }

  private pasaFiltros(item: any, filtros: MenuFiltros): boolean {
    if (filtros.evitarAlergenos) {
      const tieneAlergeno = item.ingredientes.some((ii: any) => ii.ingrediente.esAlergeno)
      if (tieneAlergeno) return false
    }

    if (filtros.dieta && filtros.dieta.length > 0) {
      const itemTags: string[] = item.clasificaciones.map((ic: any) =>
        (ic.clasificacion.nombre as string).toLowerCase(),
      )
      const pasaTodos = filtros.dieta.every((tag) => itemTags.includes(tag.toLowerCase()))
      if (!pasaTodos) return false
    }

    return true
  }

  private serializeItem(item: any) {
    return {
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      precioBase: Number(item.precioBase),
      imagenUrl: item.imagenUrl,
      ingredientes: item.ingredientes.map((ii: any) => ({
        id: ii.id,
        ingredienteId: ii.ingredienteId,
        esOriginal: ii.esOriginal,
        cantidad: Number(ii.cantidad),
        esRemovible: ii.esRemovible,
        esAgregable: ii.esAgregable,
        precioExtra: Number(ii.precioExtra),
        cantidadMin: ii.cantidadMin,
        cantidadMax: ii.cantidadMax,
        ingrediente: {
          id: ii.ingrediente.id,
          nombre: ii.ingrediente.nombre,
          esAlergeno: ii.ingrediente.esAlergeno,
        },
      })),
      clasificaciones: item.clasificaciones.map((ic: any) => ({
        id: ic.clasificacion.id,
        nombre: ic.clasificacion.nombre,
      })),
    }
  }
}
