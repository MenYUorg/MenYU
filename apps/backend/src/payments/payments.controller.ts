import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common'
import { Response } from 'express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PaymentsService } from './payments.service'

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('solicitar-efectivo')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar intención de pago en efectivo' })
  @ApiResponse({ status: 201, description: 'Pago en efectivo registrado' })
  solicitarEfectivo(@Body() body: { sesionId: string; pedidoId: string; monto: number }) {
    return this.payments.solicitarEfectivo(body.sesionId, body.pedidoId, body.monto)
  }

  @Get('sesiones')
  @ApiOperation({ summary: 'Listar sesiones de mesa de un restaurante (para caja)' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones con estado de pago' })
  getSesiones(@Query('restauranteId') restauranteId: string) {
    return this.payments.getSesiones(restauranteId)
  }

  @Post('confirmar-efectivo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar pago en efectivo y cerrar sesión' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  confirmarEfectivo(@Body() body: { sesionId: string; mozoId?: string }) {
    return this.payments.confirmarEfectivo(body.sesionId, body.mozoId)
  }

  @Post('mercadopago/crear-preferencia')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear preferencia de pago con Mercado Pago' })
  crearPreferenciaMP(
    @Body() body: { sesionId: string; pedidoId: string; monto: number },
    @Headers('origin') origin?: string,
  ) {
    return this.payments.crearPreferenciaMercadoPago(body.sesionId, body.pedidoId, body.monto, origin)
  }

  @Post('webhook/mercadopago/restaurante/:restauranteId/pedido/:pedidoId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de notificaciones de Mercado Pago' })
  async webhookMercadoPago(
    @Param('restauranteId') restauranteId: string,
    @Param('pedidoId') pedidoId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    res.status(HttpStatus.OK).send('OK')
    try {
      await this.payments.procesarWebhookMercadoPago(restauranteId, pedidoId, query)
    } catch (err) {
      console.error('Error procesando webhook MP:', err)
    }
  }
}
