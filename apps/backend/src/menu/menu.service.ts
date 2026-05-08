import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EtiquetaDieta } from '@prisma/client'

export interface MenuFiltros {
  categoriaId?: string
  buscar?: string
  dieta?: EtiquetaDieta[]
  evitarAlergenos?: boolean
}

const ITEM_INCLUDE = {
  ingredientes: {
    include: { ingrediente: true },
    orderBy: [{ esOriginal: 'desc' as const }, { ingrediente: { nombre: 'asc' as const } }],
  },
  variantes: {
    where: { disponible: true },
    orderBy: { precioExtra: 'asc' as const },
  },
} as const

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenuPublico(restauranteId: string, filtros: MenuFiltros) {
    const restaurante = await this.prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: { id: true, nombre: true, activo: true },
    })
    if (!restaurante || !restaurante.activo) throw new NotFoundException('Restaurante no encontrado')

    const categorias = await this.prisma.categoriaMenu.findMany({
      where: {
        restauranteId,
        ...(filtros.categoriaId ? { id: filtros.categoriaId } : {}),
      },
      orderBy: { orden: 'asc' },
      include: {
        subcategorias: {
          orderBy: { orden: 'asc' },
          include: {
            items: {
              where: {
                disponible: true,
                ...(filtros.buscar
                  ? { nombre: { contains: filtros.buscar, mode: 'insensitive' } }
                  : {}),
              },
              include: ITEM_INCLUDE,
            },
          },
        },
      },
    })

    const result = categorias
      .map((cat) => ({
        id: cat.id,
        nombre: cat.nombre,
        orden: cat.orden,
        subcategorias: cat.subcategorias
          .map((sub) => ({
            id: sub.id,
            nombre: sub.nombre,
            orden: sub.orden,
            items: sub.items
              .filter((item) => this.pasaFiltros(item, filtros))
              .map((item) => this.serializeItem(item)),
          }))
          .filter((sub) => sub.items.length > 0),
      }))
      .filter((cat) => cat.subcategorias.length > 0)

    return {
      restaurante: { id: restaurante.id, nombre: restaurante.nombre },
      categorias: result,
    }
  }

  private pasaFiltros(item: any, filtros: MenuFiltros): boolean {
    if (filtros.evitarAlergenos) {
      const tieneAlergeno = item.ingredientes.some((ii: any) => ii.ingrediente.esAlergeno)
      if (tieneAlergeno) return false
    }

    if (filtros.dieta && filtros.dieta.length > 0) {
      for (const tag of filtros.dieta) {
        const todosLoIngredientesOriginalesTienenTag = item.ingredientes
          .filter((ii: any) => ii.esOriginal)
          .every((ii: any) => (ii.ingrediente.etiquetas as EtiquetaDieta[]).includes(tag))
        if (!todosLoIngredientesOriginalesTienenTag) return false
      }
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
      tiempoPreparacion: item.tiempoPreparacion,
      calorias: item.calorias,
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
          etiquetas: ii.ingrediente.etiquetas,
        },
      })),
      variantes: item.variantes.map((v: any) => ({
        id: v.id,
        nombre: v.nombre,
        precioExtra: Number(v.precioExtra),
        disponible: v.disponible,
      })),
    }
  }
}
