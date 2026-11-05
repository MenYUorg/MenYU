import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SessionAuthGuard } from '../auth/guards/session-auth.guard'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION, SALON } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PaymentsService } from './payments.service'
import { ConfirmarEfectivoDto } from './dto/confirmar-efectivo.dto'
import { evaluarFirmaDelWebhook } from './firma-del-webhook'
import { clasificarErrorDelWebhook, mensajeDelError } from './clasificar-error-del-webhook'

/** Cuántos nombres de parámetros de la query entran en el log del webhook. */
const MAX_PARAMETROS_EN_EL_LOG = 10
/** Largo máximo de cada nombre o id que entra en el log (vienen de la URL: los arma quien llama). */
const MAX_LARGO_EN_EL_LOG = 40

/** Lo que viene de la URL entra al log solo con `[\w.-]` y recortado: sin saltos de línea ni nada para inyectar. */
const paraElLog = (texto: string) => texto.replace(/[^\w.-]/g, '').slice(0, MAX_LARGO_EN_EL_LOG)

const presente = (header: string | undefined) => (header?.trim() ? 'sí' : 'no')

@ApiTags('payments')
@Controller('payments')
export class PaymentsController implements OnModuleInit {
  private readonly logger = new Logger(PaymentsController.name)

  constructor(private readonly payments: PaymentsService) {}

  onModuleInit() {
    // Una sola vez al arrancar: sin el secreto el webhook anda igual, pero no se puede evaluar la firma (DT-02).
    if (!process.env.MP_WEBHOOK_SECRET) {
      this.logger.warn('MP_WEBHOOK_SECRET no está definida: las firmas del webhook de Mercado Pago no se evalúan')
    }
  }

  @Post('solicitar-efectivo')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Registrar intención de pago en efectivo' })
  @ApiResponse({ status: 201, description: 'Pago en efectivo registrado' })
  solicitarEfectivo(@Body() body: { sesionId: string }) {
    return this.payments.solicitarEfectivo(body.sesionId)
  }

  @Get('sesiones')
  @RequiereRolEn({ query: 'restauranteId' }, ...SALON)
  @ApiOperation({ summary: 'Listar sesiones de mesa de un restaurante (para caja)' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones con estado de pago' })
  getSesiones(@Query('restauranteId') restauranteId: string) {
    return this.payments.getSesiones(restauranteId)
  }

  @Get('requieren-revision')
  @RequiereRolEn({ query: 'restauranteId' }, ...ADMINISTRACION)
  @ApiOperation({
    summary: 'Pagos de Mercado Pago marcados para revisión (aprobados sobre un pago cancelado o una sesión cerrada)',
  })
  @ApiResponse({ status: 200, description: 'Hasta 200 pagos del restaurante, más nuevos primero. Solo lectura' })
  @ApiResponse({ status: 401, description: 'Sin sesión de Supabase' })
  @ApiResponse({ status: 403, description: 'Sin el rol OWNER o GERENTE en el restaurante' })
  listarPagosParaRevision(@Query('restauranteId') restauranteId: string) {
    return this.payments.listarPagosParaRevision(restauranteId)
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
  // La firma (DT-02) por ahora solo se observa: se evalúa y se loguea, y la notificación se procesa igual.
  // Responde después de procesar (DT-11): 200 si quedó procesada o no se puede procesar nunca; 500 si la falla es
  // transitoria o hay que hacer algo (reconectar MP), para que MP reintente. Qué es cada cosa lo decide
  // clasificarErrorDelWebhook.
  @Post('webhook/mercadopago/restaurante/:restauranteId/pago/:pagoId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de notificaciones de Mercado Pago' })
  @ApiResponse({ status: 200, description: 'Procesada, o no se puede procesar (MP no reintenta)' })
  @ApiResponse({ status: 500, description: 'Falla transitoria o MP desconectado (MP reintenta)' })
  async webhookMercadoPago(
    @Param('restauranteId') restauranteId: string,
    @Param('pagoId') pagoId: string,
    @Query() query: Record<string, string>,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
  ): Promise<string> {
    this.registrarFirma(restauranteId, pagoId, query, xSignature, xRequestId)
    try {
      await this.payments.procesarWebhookMercadoPago(restauranteId, pagoId, query)
      return 'OK'
    } catch (err) {
      const { respuesta, codigo, status, accion } = clasificarErrorDelWebhook(err)
      const contexto =
        `pagoId=${paraElLog(pagoId)} restauranteId=${paraElLog(restauranteId)} codigo=${codigo}` +
        `${status ? ` status=${status}` : ''} mensaje="${mensajeDelError(err)}"`
      if (respuesta === 200) {
        this.logger.warn(`webhook MP: notificación no procesable (${contexto})`)
        return 'OK'
      }
      this.logger.error(`webhook MP: ${accion ? `hay que ${accion}` : 'no se pudo procesar, MP va a reintentar'} (${contexto})`)
      // El cuerpo es genérico: el detalle queda en el log.
      throw new InternalServerErrorException('No se pudo procesar la notificación')
    }
  }

  /**
   * Una línea por notificación con lo que trajo y cómo dio la firma. Nunca el secreto, el `v1`, los valores de la
   * query ni tokens: de la query van los nombres y, como único valor, el tipo (`topic` o `type`). No lanza: un error
   * acá no puede cambiar la respuesta a MP.
   */
  private registrarFirma(
    restauranteId: string,
    pagoId: string,
    query: Record<string, string>,
    xSignature: string | undefined,
    xRequestId: string | undefined,
  ) {
    try {
      const secret = process.env.MP_WEBHOOK_SECRET ?? ''
      const firma = !secret
        ? 'sin-secreto'
        : !xSignature?.trim()
          ? 'sin-header'
          : evaluarFirmaDelWebhook({ xSignature, xRequestId, dataId: query['data.id'], secret })
      const nombres = Object.keys(query).map(paraElLog).filter(Boolean).slice(0, MAX_PARAMETROS_EN_EL_LOG)
      // El tipo es el único valor de la query que entra al log: no es sensible y hace falta para saber qué
      // notificaciones firma MP (payment, merchant_order). Misma precedencia que el provider.
      const tipoCrudo: unknown = query.topic ?? query.type
      const tipo = (typeof tipoCrudo === 'string' && paraElLog(tipoCrudo)) || 'sin-tipo'
      const linea =
        `webhook MP: restauranteId=${paraElLog(restauranteId)} pagoId=${paraElLog(pagoId)} ` +
        `x-signature=${presente(xSignature)} x-request-id=${presente(xRequestId)} query=[${nombres.join(',')}] ` +
        `tipo=${tipo} firma=${firma}`
      if (firma === 'valida') this.logger.log(linea)
      else this.logger.warn(linea)
    } catch {
      // Ni el aviso puede lanzar: la respuesta a MP no depende del log.
      try {
        this.logger.warn('webhook MP: no se pudo registrar la firma de la notificación')
      } catch {
        // nada
      }
    }
  }
}
