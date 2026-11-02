import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { PreguntaFrecuenteDto } from './dto/pregunta-frecuente.dto'
import { PreguntaFrecuente, PreguntasFrecuentesService } from './preguntas-frecuentes.service'

// OWNER de la marca o GERENTE del restaurante: los mismos roles que la edición de la carta.
@ApiTags('preguntas-frecuentes')
@Controller('restaurantes/:restauranteId/preguntas-frecuentes')
@RequiereRol(...ADMINISTRACION)
export class PreguntasFrecuentesController {
  constructor(private readonly preguntas: PreguntasFrecuentesService) {}

  @Get()
  @ApiOperation({ summary: 'Preguntas frecuentes del local para el asistente, por fecha de creación' })
  @ApiResponse({ status: 200, description: 'Las preguntas frecuentes del restaurante' })
  listar(@Param('restauranteId') restauranteId: string): Promise<PreguntaFrecuente[]> {
    return this.preguntas.listar(restauranteId)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar una pregunta frecuente' })
  @ApiResponse({ status: 201, description: 'Pregunta frecuente creada' })
  @ApiResponse({ status: 400, description: 'Falta la pregunta o la respuesta, o son muy largas' })
  crear(@Param('restauranteId') restauranteId: string, @Body() dto: PreguntaFrecuenteDto): Promise<PreguntaFrecuente> {
    return this.preguntas.crear(restauranteId, dto)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editar una pregunta frecuente (van la pregunta y la respuesta)' })
  @ApiResponse({ status: 200, description: 'Pregunta frecuente actualizada' })
  @ApiResponse({ status: 400, description: 'Falta la pregunta o la respuesta, o son muy largas' })
  @ApiResponse({ status: 404, description: 'No hay una pregunta frecuente con ese id en este restaurante' })
  actualizar(
    @Param('restauranteId') restauranteId: string,
    @Param('id') id: string,
    @Body() dto: PreguntaFrecuenteDto,
  ): Promise<PreguntaFrecuente> {
    return this.preguntas.actualizar(restauranteId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar una pregunta frecuente' })
  @ApiResponse({ status: 204, description: 'Pregunta frecuente borrada' })
  @ApiResponse({ status: 404, description: 'No hay una pregunta frecuente con ese id en este restaurante' })
  async eliminar(@Param('restauranteId') restauranteId: string, @Param('id') id: string): Promise<void> {
    await this.preguntas.eliminar(restauranteId, id)
  }
}
