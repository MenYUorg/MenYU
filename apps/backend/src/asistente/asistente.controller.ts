import { Body, Controller, Headers, Ip, Param, Post, Res } from '@nestjs/common'
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger'
import { pipeUIMessageStreamToResponse } from 'ai'
import { Response } from 'express'
import { AsistenteService } from './asistente.service'
import { MensajesDelAsistenteDto } from './dto/mensajes-del-asistente.dto'

// Pública: la carta vista desde Discovery no tiene sesión. El token de la sesión de mesa es opcional y, si viene, lo
// verifica el service (como en POST /waiter-calls). Los límites de uso también los aplica el service, sin guards: el
// límite por IP depende de si el token es válido (ver LimitePorIpService).
@ApiTags('asistente')
@Controller('asistente')
export class AsistenteController {
  constructor(private readonly asistente: AsistenteService) {}

  @Post(':restauranteId/mensajes')
  @ApiOperation({
    summary:
      'Preguntarle al asistente del restaurante. Token de la sesión de mesa opcional (Authorization: Bearer); sin él, la pregunta entra sin sesión',
  })
  @ApiProduces('text/event-stream')
  @ApiResponse({
    status: 200,
    description:
      'La respuesta en streaming: SSE con el UI message stream del AI SDK (x-vercel-ai-ui-message-stream: v1). Un error a mitad de la respuesta llega como evento "error" con { codigo, mensaje } en errorText',
  })
  @ApiResponse({ status: 400, description: '{ codigo, mensaje }: pregunta_larga o pregunta_invalida (o un body mal formado)' })
  @ApiResponse({ status: 403, description: '{ codigo, mensaje }: asistente_deshabilitado o sesion_invalida' })
  @ApiResponse({
    status: 429,
    description:
      '{ codigo, mensaje }: limite_sesion (con token de mesa, ASISTENTE_MAX_PREGUNTAS_SESION) o limite_ip (sin token, ASISTENTE_THROTTLE_LIMITE cada ASISTENTE_THROTTLE_TTL segundos)',
  })
  @ApiResponse({ status: 502, description: '{ codigo, mensaje }: error_del_asistente (el modelo falló antes de responder)' })
  @ApiResponse({
    status: 503,
    description:
      '{ codigo, mensaje }: no_disponible_hoy (se llegó al tope diario, ASISTENTE_MAX_PREGUNTAS_DIA) o no_disponible_momentaneamente (el proveedor no tiene cupo)',
  })
  async mensajes(
    @Param('restauranteId') restauranteId: string,
    @Body() dto: MensajesDelAsistenteDto,
    @Headers('authorization') authHeader: string | undefined,
    @Ip() ip: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const stream = await this.asistente.responder(restauranteId, dto.mensajes, authHeader, ip)
    await pipeUIMessageStreamToResponse({ response: res, stream })
  }
}
