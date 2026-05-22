import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PedidosService } from './pedidos.service'
import { CreatePedidoDto } from './dto/create-pedido.dto'
import { UpdateEstadoPedidoDto } from './dto/update-estado-pedido.dto'

@ApiTags('pedidos')
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar pedidos por restaurante y estado' })
  listarPorEstado(
    @Query('restauranteId') restauranteId: string,
    @Query('estado') estado: string,
  ) {
    return this.pedidos.listarPorEstado(restauranteId, estado)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Confirmar pedido desde el carrito del cliente' })
  @ApiResponse({ status: 201, description: 'Pedido creado' })
  @ApiResponse({ status: 401, description: 'Session JWT requerido o inválido' })
  @ApiResponse({ status: 400, description: 'Sesión no activa o modificador inválido' })
  @ApiResponse({ status: 404, description: 'Sesión, ítem o ingrediente no encontrado' })
  confirmar(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreatePedidoDto,
  ) {
    return this.pedidos.confirmar(authHeader, dto)
  }

  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Avanzar el estado de un pedido (solo staff)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 400, description: 'Transición de estado inválida' })
  @ApiResponse({ status: 401, description: 'JWT requerido o inválido' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  actualizarEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoPedidoDto,
    @Req() req: Request,
  ) {
    return this.pedidos.actualizarEstado(id, dto, req)
  }
}
