import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SessionAuthGuard } from '../auth/guards/session-auth.guard'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { TipoGuard } from '../auth/guards/tipo.guard'
import { RequiresTipo } from '../auth/decorators/requires-tipo.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { PaymentsService, EstadoComensalesResult } from './payments.service'
import { CobrarComensalDto } from './dto/cobrar-comensal.dto'

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('solicitar-efectivo')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Registrar intención de pago en efectivo' })
  @ApiResponse({ status: 201, description: 'Pago en efectivo registrado' })
  solicitarEfectivo(
    @Body()
    body: {
      sesionId: string
      comensalId: string | null
      modo: 'partes_iguales' | 'por_consumo' | null
    },
  ) {
    return this.payments.solicitarEfectivo(body.sesionId, body.comensalId, body.modo)
  }

  @Post('avisar-mozo-cuenta')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Avisar al mozo que la mesa pidió la cuenta, sin generar un pago individual' })
  avisarMozoCuenta(@Body() body: { sesionId: string }) {
    return this.payments.avisarMozoPedidoDeCuenta(body.sesionId)
  }

  @Get('sesiones')
  @UseGuards(JwtAuthGuard, TipoGuard)
  @RequiresTipo('admin', 'mozo')
  @ApiOperation({ summary: 'Listar sesiones de mesa de un restaurante (para caja)' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones con estado de pago' })
  getSesiones(@Query('restauranteId') restauranteId: string) {
    return this.payments.getSesiones(restauranteId)
  }

  @Get('sesiones/:sesionId/comensales')
  @UseGuards(JwtAuthGuard, TipoGuard)
  @RequiresTipo('admin', 'mozo')
  @ApiOperation({ summary: 'Estado de pago por comensal de una sesión (cobro individual desde staff)' })
  @ApiResponse({ status: 200, description: 'Montos y estado de pago por comensal, incluidos slots virtuales' })
  @ApiResponse({ status: 403, description: 'Sin acceso a este restaurante' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  estadoComensales(
    @Param('sesionId') sesionId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<EstadoComensalesResult> {
    return this.payments.estadoComensales(sesionId, user)
  }

  @Post('sesiones/:sesionId/comensales/cobrar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TipoGuard)
  @RequiresTipo('admin', 'mozo')
  @ApiOperation({ summary: 'Cobrar a un comensal (real o slot virtual materializado) desde staff' })
  @ApiResponse({ status: 200, description: 'Pago registrado; cierra la sesión si cubre el total' })
  @ApiResponse({ status: 400, description: 'Monto 0, modo de división no definido, o sesión cerrada' })
  @ApiResponse({ status: 403, description: 'Sin acceso a este restaurante' })
  @ApiResponse({ status: 404, description: 'Sesión o comensal no encontrado' })
  @ApiResponse({ status: 409, description: 'Pago ya aprobado, o el slot ya no está disponible' })
  cobrarComensal(
    @Param('sesionId') sesionId: string,
    @Body() dto: CobrarComensalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.payments.cobrarComensal(sesionId, dto, user)
  }

  @Post('confirmar-efectivo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TipoGuard)
  @RequiresTipo('admin', 'mozo')
  @ApiOperation({ summary: 'Confirmar pago en efectivo y cerrar sesión' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  confirmarEfectivo(@Body() body: { pagoId: string; mozoId?: string }) {
    return this.payments.confirmarEfectivo(body.pagoId, body.mozoId)
  }

  @Post('mercadopago/crear-preferencia')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Crear preferencia de pago con Mercado Pago' })
  crearPreferenciaMP(
    @Body() body: { sesionId: string; comensalId: string | null; modo: 'partes_iguales' | 'por_consumo' | null },
    @Headers('origin') origin?: string,
  ) {
    return this.payments.crearPreferenciaMercadoPago(body.sesionId, body.comensalId, body.modo, origin)
  }

  // Sin guard a propósito: a este endpoint le pega Mercado Pago, no un cliente de MenYU
  // (ni sesión de mesa ni JWT de staff). La verificación de que la notificación es legítima
  // pasa por otro lado: procesarWebhookMercadoPago vuelve a consultar el pago/orden contra la
  // API de MP con el access token del restaurante, no confía en el body de la request entrante.
  @Post('webhook/mercadopago/restaurante/:restauranteId/pago/:pagoId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de notificaciones de Mercado Pago' })
  async webhookMercadoPago(
    @Param('restauranteId') restauranteId: string,
    @Param('pagoId') pagoId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    res.status(HttpStatus.OK).send('OK')
    try {
      await this.payments.procesarWebhookMercadoPago(restauranteId, pagoId, query)
    } catch (err) {
      console.error('Error procesando webhook MP:', err)
    }
  }
}
