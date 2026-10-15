import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { DiscoveryService } from './discovery.service'
import { BuscarDiscoveryDto } from './dto/buscar-discovery.dto'
import { IdRestaurantePipe } from './id-restaurante.pipe'

// Endpoints públicos y anónimos: la pantalla de inicio de web-cliente los usa sin iniciar sesión.
@ApiTags('discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get()
  @ApiOperation({ summary: 'Restaurantes activos y platos en oferta (público)' })
  @ApiResponse({
    status: 200,
    description: 'Hasta 50 restaurantes (por nombre) y hasta 30 ofertas (por porcentaje de descuento mayor)',
  })
  getDiscovery() {
    return this.discovery.getDiscovery()
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Buscar restaurantes, platos y ofertas (público; ignora mayúsculas y acentos)' })
  @ApiResponse({ status: 200, description: 'Restaurantes, restaurantes con platos que coinciden y ofertas que coinciden' })
  @ApiResponse({ status: 400, description: 'Falta q o tiene menos de 2 caracteres' })
  buscar(@Query() query: BuscarDiscoveryDto) {
    return this.discovery.buscar(query.q)
  }

  @Get('restaurantes/:id')
  @ApiOperation({ summary: 'Un restaurante y sus ofertas (público)' })
  @ApiResponse({ status: 200, description: 'El restaurante y hasta 30 de sus ofertas, por porcentaje de descuento mayor' })
  @ApiResponse({ status: 404, description: 'El restaurante no existe, no está activo o su marca no está activa' })
  getRestaurante(@Param('id', IdRestaurantePipe) id: string) {
    return this.discovery.getRestaurante(id)
  }
}
