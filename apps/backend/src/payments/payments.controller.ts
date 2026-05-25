import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
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
}
