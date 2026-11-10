import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CierreService } from './cierre.service'
import { CerrarTurnoDto } from './dto/cerrar-turno.dto'

// El cierre de un turno con el arqueo de sus cajas. El service resuelve el restaurante desde el turno y pide el grupo CAJA;
// quién cierra sale de la cuenta.
@ApiTags('turnos')
@Controller('turnos')
export class CierreController {
  constructor(private readonly cierre: CierreService) {}

  @Post(':id/cierre')
  @Personal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar el turno con el arqueo de sus cajas (OWNER, GERENTE y JEFE_SALON)' })
  @ApiResponse({ status: 200, description: 'El turno cerrado, el arqueo de cada caja y las mesas que quedaron abiertas' })
  @ApiResponse({ status: 400, description: 'Falta o sobra una caja, o el arqueo no entra en el máximo, o el body no es válido' })
  @ApiResponse({ status: 403, description: 'Sin el rol en el restaurante del turno' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  @ApiResponse({ status: 409, description: 'El turno ya está cerrado, o una operación simultánea' })
  cerrar(@Param('id') id: string, @Body() dto: CerrarTurnoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.cierre.cerrar(id, dto, usuario)
  }
}
