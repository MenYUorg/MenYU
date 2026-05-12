import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { MenuService } from './menu.service'

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
    description: 'Filtrar por nombre de clasificación separados por coma (ej: Vegano,Sin TACC)',
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
      ? dietaRaw.split(',').map((d) => d.trim()).filter(Boolean)
      : undefined

    return this.menu.getMenuPublico(restauranteId, {
      categoriaId: categoriaId || undefined,
      buscar: buscar || undefined,
      dieta: dieta && dieta.length > 0 ? dieta : undefined,
      evitarAlergenos: evitarAlergenosRaw === 'true',
    })
  }
}
