import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PaymentsService } from './payments.service'
import { InitiatePaymentDto } from './dto/initiate-payment.dto'

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Iniciar un pago para la sesión activa' })
  @ApiResponse({ status: 201, description: 'Preferencia de pago creada' })
  @ApiResponse({ status: 401, description: 'Session JWT requerido o inválido' })
  @ApiResponse({ status: 400, description: 'Restaurante sin Mercado Pago configurado' })
  initiate(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.payments.initiatePayment(authHeader, dto)
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de Mercado Pago (sin auth)' })
  @ApiResponse({ status: 200, description: 'Webhook procesado' })
  webhook(@Body() payload: unknown) {
    return this.payments.handleWebhook(payload)
  }

  @Get('status/:externalId')
  @ApiOperation({ summary: 'Consultar estado de un pago por ID externo' })
  @ApiResponse({ status: 200, description: 'Estado del pago' })
  status(@Param('externalId') externalId: string) {
    return this.payments.getStatus(externalId)
  }

  @Get('connect/:restauranteId')
  @ApiOperation({ summary: 'Obtener URL de autorización de Mercado Pago para un restaurante' })
  @ApiResponse({ status: 200, description: 'URL de autorización' })
  connect(@Param('restauranteId') restauranteId: string) {
    return this.payments.getMpAuthUrl(restauranteId)
  }

  @Get('callback')
  @ApiOperation({ summary: 'Callback OAuth de Mercado Pago' })
  @ApiResponse({ status: 200, description: 'Cuenta conectada' })
  callback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.payments.handleMpCallback(code, state)
  }
}
