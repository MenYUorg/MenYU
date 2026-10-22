import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { SALON } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { WaiterCallsService } from './waiter-calls.service'
import { CreateWaiterCallDto } from './dto/create-waiter-call.dto'

// POST es del comensal (token de la sesión de mesa, verificado en el service). Listar y atender, del salón.
@ApiTags('waiter-calls')
@Controller('waiter-calls')
export class WaiterCallsController {
  constructor(private readonly waiterCalls: WaiterCallsService) {}

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...SALON)
  @ApiOperation({ summary: 'Listar llamados pendientes de un restaurante (el salón)' })
  @ApiResponse({ status: 200, description: 'Lista de llamados pendientes' })
  getAll(@Query('restauranteId') restauranteId: string) {
    return this.waiterCalls.findByRestaurante(restauranteId)
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Llamar al mozo desde la mesa' })
  @ApiResponse({ status: 200, description: 'Llamado emitido' })
  @ApiResponse({ status: 401, description: 'Session JWT requerido o inválido' })
  @ApiResponse({ status: 400, description: 'Sesión no activa' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  llamar(
    @Body() dto: CreateWaiterCallDto,
    @Headers('authorization') authHeader: string | undefined,
  ) {
    return this.waiterCalls.llamar(dto, authHeader)
  }

  @Patch(':id/atender')
  @Personal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar llamado como atendido (JEFE_SALON o MOZO del restaurante del llamado)' })
  @ApiResponse({ status: 200, description: 'Llamado marcado como atendido' })
  @ApiResponse({ status: 400, description: 'Este llamado ya fue atendido' })
  @ApiResponse({ status: 404, description: 'Llamado no encontrado' })
  atender(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.waiterCalls.atender(id, usuario)
  }
}
