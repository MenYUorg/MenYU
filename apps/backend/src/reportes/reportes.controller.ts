import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ReportesService } from './reportes.service'

@ApiTags('reportes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER', 'GERENTE')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Get('ventas-hoy')
  @ApiOperation({ summary: 'Total de ventas del período para un restaurante' })
  @ApiQuery({ name: 'restauranteId', required: true })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  ventasHoy(
    @Query('restauranteId') restauranteId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportes.ventasHoy(restauranteId, desde, hasta)
  }

  @Get('ventas-por-hora')
  @ApiOperation({ summary: 'Ventas agrupadas por hora del período' })
  @ApiQuery({ name: 'restauranteId', required: true })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  ventasPorHora(
    @Query('restauranteId') restauranteId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportes.ventasPorHora(restauranteId, desde, hasta)
  }

  @Get('top-items')
  @ApiOperation({ summary: 'Top ítems más vendidos del período' })
  @ApiQuery({ name: 'restauranteId', required: true })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  topItems(
    @Query('restauranteId') restauranteId: string,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportes.topItems(restauranteId, limit, desde, hasta)
  }

  @Get('ventas-por-dia')
  @ApiOperation({ summary: 'Ventas agrupadas por día en un rango' })
  @ApiQuery({ name: 'restauranteId', required: true })
  @ApiQuery({ name: 'desde', required: false })
  @ApiQuery({ name: 'hasta', required: false })
  ventasPorDia(
    @Query('restauranteId') restauranteId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.reportes.ventasPorDia(restauranteId, desde, hasta)
  }
}
