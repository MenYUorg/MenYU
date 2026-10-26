import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { SALON } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { SessionAuthGuard, SessionJwtPayload } from '../auth/guards/session-auth.guard'
import { SessionsService, OpenSessionResult, OpenStaffSessionResult } from './sessions.service'
import { OpenSessionDto } from './dto/open-session.dto'
import { OpenStaffSessionDto } from './dto/open-staff-session.dto'
import { RegistrarCobroDto } from './dto/registrar-cobro.dto'

// `open` y `close` son del comensal. Las demás, del salón (OWNER, GERENTE, JEFE_SALON y MOZO): con el restaurante en la
// query lo exige la ruta; en las de una mesa o una sesión, el service con el restaurante de la mesa.
@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('open-staff')
  @Personal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abrir o recuperar sesión de mesa desde el salón' })
  @ApiResponse({ status: 200, description: 'Sesión activa o nueva creada' })
  @ApiResponse({ status: 404, description: 'Mesa no encontrada' })
  openStaff(
    @Body() dto: OpenStaffSessionDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<OpenStaffSessionResult> {
    return this.sessions.openStaff(dto, usuario)
  }

  @Post('open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abrir o unirse a una sesión de mesa (por qrToken o restaurantId+pin)' })
  @ApiResponse({ status: 200, description: 'Sesión abierta o unión exitosa' })
  @ApiResponse({ status: 403, description: 'Mesa en modo seguro — se requiere código de sesión' })
  @ApiResponse({ status: 404, description: 'Mesa no encontrada' })
  @ApiResponse({ status: 409, description: 'El QR es de una mesa de otro restaurante que el indicado en restauranteId' })
  open(
    @Body() dto: OpenSessionDto,
    @Headers('authorization') authHeader: string | undefined,
  ): Promise<OpenSessionResult> {
    return this.sessions.open(dto, authHeader)
  }

  @Post('mesa/:mesaId/cerrar')
  @Personal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar la sesión activa de una mesa (el salón)' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  @ApiResponse({ status: 404, description: 'Mesa no encontrada o sin sesión activa' })
  cerrarMesaAdmin(
    @Param('mesaId') mesaId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ ok: boolean }> {
    return this.sessions.cerrarMesaAdmin(mesaId, usuario)
  }

  @Get('mesa/:mesaId/activa')
  @Personal()
  @ApiOperation({ summary: 'Obtener datos de la sesión activa de una mesa' })
  @ApiResponse({ status: 200, description: 'Datos de la sesión activa, o null si no hay sesión' })
  @ApiResponse({ status: 404, description: 'Mesa no encontrada' })
  getSessionActiva(
    @Param('mesaId') mesaId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.sessions.getSessionActiva(mesaId, usuario)
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Cerrar la sesión activa del cliente autenticado' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  @ApiResponse({ status: 401, description: 'Session JWT requerido o inválido' })
  @ApiResponse({ status: 400, description: 'La sesión ya está cerrada' })
  close(
    @Req() req: Request & { sessionUser: SessionJwtPayload },
  ): Promise<{ ok: boolean }> {
    return this.sessions.close(req.sessionUser)
  }

  @Get('activas')
  @RequiereRolEn({ query: 'restauranteId' }, ...SALON)
  @ApiOperation({ summary: 'Listar sesiones activas de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones activas con totales y flags' })
  getSessionesActivas(@Query('restauranteId') restauranteId: string) {
    return this.sessions.getSessionesActivas(restauranteId)
  }

  @Get('pagadas')
  @RequiereRolEn({ query: 'restauranteId' }, ...SALON)
  @ApiOperation({ summary: 'Listar sesiones cobradas de un restaurante con filtro de fecha' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones cobradas' })
  getSessionesPagadas(
    @Query('restauranteId') restauranteId: string,
    @Query('fecha') fecha: string | undefined,
  ) {
    return this.sessions.getSessionesPagadas(restauranteId, fecha)
  }

  @Get('historial')
  @RequiereRolEn({ query: 'restauranteId' }, ...SALON)
  @ApiOperation({ summary: 'Historial de sesiones cerradas con pedidos e ítems completos' })
  @ApiResponse({ status: 200, description: 'Lista de sesiones con pedidos detallados' })
  getHistorialSesiones(
    @Query('restauranteId') restauranteId: string,
    @Query('desde') desde: string | undefined,
    @Query('hasta') hasta: string | undefined,
  ) {
    return this.sessions.getHistorialSesiones(restauranteId, desde, hasta)
  }

  @Patch(':id/cobro')
  @Personal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar cobro de una sesión (el salón; el mozo cobra a su nombre)' })
  @ApiResponse({ status: 200, description: 'Cobro registrado y sesión cerrada' })
  @ApiResponse({ status: 400, description: 'La sesión ya fue cerrada o no tiene pedidos' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  @ApiResponse({ status: 409, description: 'Hay pagos pendientes de comensales sin confirmar cancelación' })
  registrarCobro(
    @Param('id') id: string,
    @Body() dto: RegistrarCobroDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.sessions.registrarCobro(id, dto, usuario)
  }
}
