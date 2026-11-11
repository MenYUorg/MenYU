import { Controller, Get, Param } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { ResumenService } from './resumen.service'

// El resumen de un turno, abierto o cerrado. El service resuelve el restaurante desde el turno y pide el grupo CAJA.
@ApiTags('turnos')
@Controller('turnos')
export class ResumenController {
  constructor(private readonly resumen: ResumenService) {}

  @Get(':id/resumen')
  @Personal()
  @ApiOperation({ summary: 'Lo cobrado en las cajas del turno por método y por mozo, y Mercado Pago de la franja (OWNER, GERENTE y JEFE_SALON)' })
  @ApiResponse({ status: 200, description: 'El resumen del turno' })
  @ApiResponse({ status: 403, description: 'Sin el rol en el restaurante del turno' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  obtener(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.resumen.resumen(id, usuario)
  }
}
