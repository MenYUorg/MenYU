import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SessionsService, OpenSessionResult } from './sessions.service'
import { OpenSessionDto } from './dto/open-session.dto'

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abrir o unirse a una sesión de mesa (por qrToken o restaurantId+pin)' })
  @ApiResponse({ status: 200, description: 'Sesión abierta o unión exitosa' })
  @ApiResponse({ status: 403, description: 'Mesa en modo seguro — se requiere código de sesión' })
  @ApiResponse({ status: 404, description: 'Mesa no encontrada' })
  open(
    @Body() dto: OpenSessionDto,
    @Headers('authorization') authHeader: string | undefined,
  ): Promise<OpenSessionResult> {
    return this.sessions.open(dto, authHeader)
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar la sesión activa del cliente autenticado' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  @ApiResponse({ status: 401, description: 'Session JWT requerido o inválido' })
  @ApiResponse({ status: 400, description: 'La sesión ya está cerrada' })
  close(
    @Headers('authorization') authHeader: string | undefined,
  ): Promise<{ ok: boolean }> {
    return this.sessions.close(authHeader)
  }
}
