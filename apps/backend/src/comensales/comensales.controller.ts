import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ComensalesService } from './comensales.service'
import { DivisionService } from './division.service'
import { CrearComensalDto } from './dto/crear-comensal.dto'
import { EtiquetarItemDto } from './dto/etiquetar-item.dto'

@ApiTags('comensales')
@Controller('sesiones/:sesionId/comensales')
export class ComensalesController {
  constructor(
    private readonly comensalesService: ComensalesService,
    private readonly divisionService: DivisionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar un comensal nuevo en la sesión' })
  @ApiResponse({ status: 201, description: 'Comensal creado' })
  @ApiResponse({ status: 400, description: 'Sesión no activa o ya existe un owner en la sesión' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  crearComensal(@Param('sesionId') sesionId: string, @Body() dto: CrearComensalDto) {
    return this.comensalesService.crearComensal(sesionId, dto)
  }

  @Get()
  @ApiOperation({ summary: 'Listar los comensales de una sesión' })
  @ApiResponse({ status: 200, description: 'Lista de comensales de la sesión' })
  listarComensales(@Param('sesionId') sesionId: string) {
    return this.comensalesService.listarComensales(sesionId)
  }

  @Post('etiquetas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Etiquetar un ítem del pedido con un comensal' })
  @ApiResponse({ status: 201, description: 'Ítem etiquetado (o ya estaba etiquetado con ese comensal)' })
  @ApiResponse({ status: 404, description: 'Comensal o ítem no encontrado en esta sesión' })
  etiquetarItem(@Param('sesionId') sesionId: string, @Body() dto: EtiquetarItemDto) {
    return this.comensalesService.etiquetarItem(sesionId, dto)
  }

  @Delete('etiquetas/:pedidoItemId/:comensalId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quitar la etiqueta de un comensal en un ítem del pedido' })
  @ApiResponse({ status: 200, description: 'Etiqueta eliminada' })
  @ApiResponse({ status: 404, description: 'Comensal, ítem o asignación no encontrada en esta sesión' })
  desetiquetarItem(
    @Param('sesionId') sesionId: string,
    @Param('pedidoItemId') pedidoItemId: string,
    @Param('comensalId') comensalId: string,
  ) {
    return this.comensalesService.desetiquetarItem(sesionId, pedidoItemId, comensalId)
  }

  @Get('etiquetas/:pedidoItemId')
  @ApiOperation({ summary: 'Listar los comensales etiquetados en un ítem del pedido' })
  @ApiResponse({ status: 200, description: 'Lista de etiquetas del ítem, con el comensal incluido' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado en esta sesión' })
  listarEtiquetasDeItem(
    @Param('sesionId') sesionId: string,
    @Param('pedidoItemId') pedidoItemId: string,
  ) {
    return this.comensalesService.listarEtiquetasDeItem(sesionId, pedidoItemId)
  }

  @Get('division/partes-iguales')
  @ApiOperation({ summary: 'Calcular la división de la cuenta en partes iguales' })
  @ApiResponse({ status: 200, description: 'Monto a pagar por cada comensal' })
  @ApiResponse({ status: 400, description: 'Sin comensales registrados o sin comensal owner definido' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  calcularPartesIguales(@Param('sesionId') sesionId: string) {
    return this.divisionService.calcularPartesIguales(sesionId)
  }

  @Get('division/por-consumo')
  @ApiOperation({ summary: 'Calcular la división de la cuenta según el consumo etiquetado de cada comensal' })
  @ApiResponse({ status: 200, description: 'Monto a pagar por cada comensal según lo que consumió' })
  @ApiResponse({ status: 400, description: 'Sin comensales registrados o hay ítems sin etiquetar' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  calcularPorConsumo(@Param('sesionId') sesionId: string) {
    return this.divisionService.calcularPorConsumo(sesionId)
  }

  @Get('division/modo')
  @ApiOperation({ summary: 'Obtener el modo de división ya fijado para la sesión, si existe' })
  @ApiResponse({ status: 200, description: 'Modo de división actual (null si todavía no se decidió)' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  obtenerModoDivision(@Param('sesionId') sesionId: string) {
    return this.divisionService.obtenerModoDivision(sesionId)
  }
}
