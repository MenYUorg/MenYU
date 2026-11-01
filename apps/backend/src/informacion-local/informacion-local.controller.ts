import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { UpdateInformacionLocalDto } from './dto/update-informacion-local.dto'
import { InformacionDelLocal, InformacionLocalService } from './informacion-local.service'

// OWNER de la marca o GERENTE del restaurante: los mismos roles que la edición de la carta.
@ApiTags('informacion-local')
@Controller('restaurantes/:restauranteId/informacion-local')
@RequiereRol(...ADMINISTRACION)
export class InformacionLocalController {
  constructor(private readonly informacion: InformacionLocalService) {}

  @Get()
  @ApiOperation({ summary: 'Información del local para el asistente (horarios, formas de pago y servicios) y si está prendido' })
  @ApiResponse({ status: 200, description: 'La información del local. Sin nada cargado, todo en null y el asistente apagado' })
  obtener(@Param('restauranteId') restauranteId: string): Promise<InformacionDelLocal> {
    return this.informacion.obtener(restauranteId)
  }

  @Put()
  @ApiOperation({ summary: 'Guardar la información del local y el switch del asistente (lo que no viene no cambia; null lo borra)' })
  @ApiResponse({ status: 200, description: 'La información guardada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  guardar(
    @Param('restauranteId') restauranteId: string,
    @Body() dto: UpdateInformacionLocalDto,
  ): Promise<InformacionDelLocal> {
    return this.informacion.guardar(restauranteId, dto)
  }
}
