import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SessionAuthGuard } from '../auth/guards/session-auth.guard'
import { DivisionService } from './division.service'

// Superficie del comensal (SessionAuthGuard, igual que el resto de este módulo) — no
// confundir con SessionsController (apps/backend/src/sessions), que es panel de
// staff y sí requiere JwtAuthGuard/TipoGuard. El saldo es propiedad de la sesión,
// no de los comensales, por eso no cuelga de ComensalesController (sesiones/:sesionId/comensales).
@ApiTags('sesiones')
@Controller('sesiones/:sesionId')
@UseGuards(SessionAuthGuard)
export class SesionSaldoController {
  constructor(private readonly divisionService: DivisionService) {}

  @Get('saldo')
  @ApiOperation({ summary: 'Consultar el saldo pendiente de pago de la sesión' })
  @ApiResponse({ status: 200, description: 'Total de la sesión, total cobrado y saldo pendiente' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  obtenerSaldo(@Param('sesionId') sesionId: string) {
    return this.divisionService.obtenerSaldo(sesionId)
  }
}
