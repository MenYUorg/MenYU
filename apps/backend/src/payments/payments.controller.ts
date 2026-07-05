import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
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

  @Post('credentials/:restauranteId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ROOT', 'OWNER', 'GERENTE')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cargar credenciales de Mercado Pago manualmente (para testing)' })
  @ApiResponse({ status: 200, description: 'Credenciales guardadas' })
  setCredentials(
    @Param('restauranteId') restauranteId: string,
    @Body() body: { accessToken: string; refreshToken?: string; userId?: string },
  ) {
    return this.payments.setMpCredentials(restauranteId, body.accessToken, body.refreshToken, body.userId)
  }
}
