import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SessionAuthGuard } from '../auth/guards/session-auth.guard'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { SALON } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PaymentsService } from './payments.service'
import { ConfirmarEfectivoDto } from './dto/confirmar-efectivo.dto'

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('solicitar-efectivo')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Registrar intención de pago en efectivo' })
  @ApiResponse({ status: 201, description: 'Pago en efectivo registrado' })
  solicitarEfectivo(@Body() body: { sesionId: string }) {
    return this.payments.solicitarEfectivo(body.sesionId)
  }

  @Post('avisar-mozo-cuenta')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Avisar al mozo que la mesa pidió la cuenta, sin generar un pago individual' })
  avisarMozoCuenta(@Body() body: { sesionId: string }) {
    return this.payments.avisarMozoPedidoDeCuenta(body.sesionId)
  }

  @Get('sesiones')
  @RequiereRolEn({ query: 'restauranteId' }, ...SALON)
  @ApiOperation({ summary: 'Listar sesiones de mesa de un restaurante (para caja)' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones con estado de pago' })
  getSesiones(@Query('restauranteId') restauranteId: string) {
    return this.payments.getSesiones(restauranteId)
  }

  @Post('confirmar-efectivo')
  @Personal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar pago en efectivo y cerrar sesión (el salón del restaurante del pago)' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  confirmarEfectivo(@Body() dto: ConfirmarEfectivoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.payments.confirmarEfectivo(dto, usuario)
  }

  @Post('mercadopago/crear-preferencia')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Crear preferencia de pago con Mercado Pago' })
  crearPreferenciaMP(
    @Body() body: { sesionId: string },
    @Headers('origin') origin?: string,
  ) {
    return this.payments.crearPreferenciaMercadoPago(body.sesionId, origin)
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
