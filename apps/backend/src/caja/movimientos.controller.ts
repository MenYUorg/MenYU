import { Body, Controller, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto'
import { MovimientosService } from './movimientos.service'

// Los ingresos y egresos de una caja abierta del turno. El service resuelve el restaurante desde el turno y pide el grupo
// CAJA; quién lo carga sale de la cuenta.
@ApiTags('turnos')
@Controller('turnos')
export class MovimientosController {
  constructor(private readonly movimientos: MovimientosService) {}

  @Post(':id/movimientos')
  @Personal()
  @ApiOperation({ summary: 'Registrar un ingreso o un egreso en una caja abierta del turno (OWNER, GERENTE y JEFE_SALON)' })
  @ApiResponse({ status: 201, description: 'El movimiento registrado' })
  @ApiResponse({ status: 400, description: 'La caja no está abierta en este turno, o el body no es válido' })
  @ApiResponse({ status: 403, description: 'Sin el rol en el restaurante del turno' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  @ApiResponse({ status: 409, description: 'El turno está cerrado, o una operación simultánea' })
  registrar(@Param('id') id: string, @Body() dto: RegistrarMovimientoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.movimientos.registrar(id, dto, usuario)
  }
}
