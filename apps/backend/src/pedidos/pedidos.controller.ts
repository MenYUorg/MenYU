import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PedidosService } from './pedidos.service'
import { CreatePedidoDto } from './dto/create-pedido.dto'

@ApiTags('pedidos')
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

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
}
