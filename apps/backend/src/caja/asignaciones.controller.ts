import { Body, Controller, Param, Put } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { ReasignarMesasDto } from './dto/reasignar-mesas.dto'
import { ReasignacionService } from './reasignacion.service'

// Las mesas asignadas de un turno abierto. El service resuelve el restaurante desde el turno y pide el grupo CAJA.
@ApiTags('turnos')
@Controller('turnos')
export class AsignacionesController {
  constructor(private readonly reasignacion: ReasignacionService) {}

  @Put(':id/asignaciones')
  @Personal()
  @ApiOperation({ summary: 'Reemplazar las mesas asignadas de un turno abierto (OWNER, GERENTE y JEFE_SALON)' })
  @ApiResponse({ status: 200, description: 'El turno con sus asignaciones nuevas' })
  @ApiResponse({ status: 400, description: 'Mesas o mozos que no son del restaurante, inactivos o sin cuenta' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  @ApiResponse({ status: 409, description: 'El turno está cerrado, o una operación simultánea' })
  reasignar(@Param('id') id: string, @Body() dto: ReasignarMesasDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.reasignacion.reasignar(id, dto, usuario)
  }
}
