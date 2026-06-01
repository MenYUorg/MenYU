import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { TipoGuard } from '../auth/guards/tipo.guard'
import { RequiresTipo } from '../auth/decorators/requires-tipo.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { SessionsService, OpenSessionResult, OpenStaffSessionResult } from './sessions.service'
import { OpenSessionDto } from './dto/open-session.dto'
import { OpenStaffSessionDto } from './dto/open-staff-session.dto'

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('open-staff')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Abrir o recuperar sesión de mesa desde el staff (admin o mozo)' })
  @ApiResponse({ status: 200, description: 'Sesión activa o nueva creada' })
  @ApiResponse({ status: 403, description: 'Sin acceso a este restaurante' })
  @ApiResponse({ status: 404, description: 'Mesa no encontrada' })
  openStaff(
    @Body() dto: OpenStaffSessionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OpenStaffSessionResult> {
    return this.sessions.openStaff(dto, user)
  }

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

  @Post('mesa/:mesaId/cerrar')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TipoGuard)
  @RequiresTipo('admin', 'mozo')
  @ApiOperation({ summary: 'Cerrar la sesión activa de una mesa (admin o mozo)' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  @ApiResponse({ status: 404, description: 'Mesa no encontrada o sin sesión activa' })
  @ApiResponse({ status: 403, description: 'Sin acceso a este restaurante' })
  cerrarMesaAdmin(
    @Param('mesaId') mesaId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: boolean }> {
    return this.sessions.cerrarMesaAdmin(mesaId, user)
  }

  @Get('mesa/:mesaId/activa')
  @UseGuards(JwtAuthGuard, TipoGuard)
  @RequiresTipo('admin', 'mozo')
  @ApiOperation({ summary: 'Obtener datos de la sesión activa de una mesa' })
  @ApiResponse({ status: 200, description: 'Datos de la sesión activa, o null si no hay sesión' })
  @ApiResponse({ status: 403, description: 'Sin acceso a este recurso' })
  @ApiResponse({ status: 404, description: 'Mesa no encontrada' })
  getSessionActiva(
    @Param('mesaId') mesaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sessions.getSessionActiva(mesaId, user)
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
