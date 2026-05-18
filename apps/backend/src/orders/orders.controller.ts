import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { OrdersService } from './orders.service'
import { CreateOrderDto } from './dto/create-order.dto'

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un pedido desde el carrito del cliente' })
  @ApiResponse({ status: 201, description: 'Pedido creado' })
  @ApiResponse({ status: 401, description: 'Session JWT requerido o inválido' })
  @ApiResponse({ status: 400, description: 'Sesión no activa' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado en este restaurante' })
  create(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.create(authHeader, dto)
  }
}
