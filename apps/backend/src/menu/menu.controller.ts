import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { MenuService } from './menu.service'
import { EtiquetaDieta } from '@prisma/client'

@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get(':restauranteId')
  @ApiOperation({ summary: 'Obtener menú público de un restaurante' })
  @ApiResponse({ status: 200, description: 'Menú completo con categorías, ítems e ingredientes' })
  @ApiResponse({ status: 404, description: 'Restaurante no encontrado' })
  @ApiQuery({ name: 'categoriaId', required: false, description: 'Filtrar por categoría' })
  @ApiQuery({ name: 'buscar', required: false, description: 'Búsqueda por nombre de ítem' })
  @ApiQuery({
    name: 'dieta',
    required: false,
    description: 'Filtrar por etiquetas de dieta separadas por coma (VEGANO,SIN_TACC...)',
  })
  @ApiQuery({
    name: 'evitarAlergenos',
    required: false,
    description: 'Si es true, excluye ítems con ingredientes alérgenos',
  })
  getMenu(
    @Param('restauranteId') restauranteId: string,
    @Query('categoriaId') categoriaId?: string,
    @Query('buscar') buscar?: string,
    @Query('dieta') dietaRaw?: string,
    @Query('evitarAlergenos') evitarAlergenosRaw?: string,
  ) {
    const dieta = dietaRaw
      ? (dietaRaw.split(',').filter((d) => d in EtiquetaDieta) as EtiquetaDieta[])
      : undefined

    return this.menu.getMenuPublico(restauranteId, {
      categoriaId: categoriaId || undefined,
      buscar: buscar || undefined,
      dieta: dieta && dieta.length > 0 ? dieta : undefined,
      evitarAlergenos: evitarAlergenosRaw === 'true',
    })
  }
}
