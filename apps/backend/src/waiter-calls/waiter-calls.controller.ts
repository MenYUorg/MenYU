import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { WaiterCallsService } from './waiter-calls.service'
import { CreateWaiterCallDto } from './dto/create-waiter-call.dto'

@ApiTags('waiter-calls')
@Controller('waiter-calls')
export class WaiterCallsController {
  constructor(private readonly waiterCalls: WaiterCallsService) {}

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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar llamado como atendido (mozo autenticado)' })
  @ApiResponse({ status: 200, description: 'Llamado marcado como atendido' })
  @ApiResponse({ status: 400, description: 'Este llamado ya fue atendido' })
  @ApiResponse({ status: 401, description: 'JWT de mozo requerido o inválido' })
  @ApiResponse({ status: 404, description: 'Llamado no encontrado' })
  atender(
    @Param('id') id: string,
    @Headers('authorization') authHeader: string | undefined,
  ) {
    return this.waiterCalls.atender(id, authHeader)
  }
}
