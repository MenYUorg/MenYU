import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { PedidosService } from './pedidos.service'
import { CreatePedidoDto } from './dto/create-pedido.dto'
import { UpdateEstadoPedidoDto } from './dto/update-estado-pedido.dto'
import { EditPedidoDto } from './dto/edit-pedido.dto'

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

  @Get('auditoria')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Auditoría global de ediciones por restaurante (solo OWNER)' })
  @ApiResponse({ status: 200, description: 'Lista de ediciones de todos los pedidos del restaurante' })
  @ApiResponse({ status: 400, description: 'restauranteId requerido' })
  @ApiResponse({ status: 401, description: 'JWT requerido' })
  @ApiResponse({ status: 403, description: 'Solo OWNER' })
  getAuditoria(
    @Query('restauranteId') restauranteId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.pedidos.auditoriaEdiciones(restauranteId, desde, hasta)
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

  @Post('staff')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear pedido desde el staff (admin o mozo) — va directo a en_preparacion' })
  @ApiResponse({ status: 201, description: 'Pedido creado' })
  @ApiResponse({ status: 401, description: 'JWT requerido' })
  @ApiResponse({ status: 403, description: 'Sin acceso al restaurante' })
  @ApiResponse({ status: 404, description: 'Sesión, ítem o ingrediente no encontrado' })
  crearStaff(
    @Body() dto: CreatePedidoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pedidos.crearStaff(dto, user)
  }

  @Patch(':id/editar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Editar ítems de un pedido entregado con auditoría (admin GERENTE/ROOT o mozo)' })
  @ApiResponse({ status: 200, description: 'Pedido actualizado con edición registrada' })
  @ApiResponse({ status: 400, description: 'Validación fallida o estado inválido' })
  @ApiResponse({ status: 401, description: 'JWT requerido' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  editarPedido(
    @Param('id') id: string,
    @Body() dto: EditPedidoDto,
    @Req() req: Request,
  ) {
    return this.pedidos.editarPedido(id, dto, req)
  }

  @Get(':id/ediciones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historial de ediciones de un pedido (solo admin)' })
  @ApiResponse({ status: 200, description: 'Lista de ediciones' })
  @ApiResponse({ status: 401, description: 'JWT requerido' })
  @ApiResponse({ status: 403, description: 'Solo admins' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  getEdiciones(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.pedidos.getEdiciones(id, req)
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
