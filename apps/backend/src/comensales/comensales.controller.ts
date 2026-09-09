import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ComensalesService } from './comensales.service'
import { DivisionService } from './division.service'
import { CrearComensalDto } from './dto/crear-comensal.dto'
import { EtiquetarItemDto } from './dto/etiquetar-item.dto'
import { ReclamarComensalDto } from './dto/reclamar-comensal.dto'
import { SetCantidadComensalesDto } from './dto/set-cantidad-comensales.dto'

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
  @ApiResponse({ status: 409, description: 'Sesión congelada, o nombre ya usado en la sesión' })
  crearComensal(@Param('sesionId') sesionId: string, @Body() dto: CrearComensalDto) {
    return this.comensalesService.crearComensal(sesionId, dto)
  }

  @Post('reclamar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reclamar un comensal existente de la sesión con el PIN de la mesa (no crea nada)' })
  @ApiResponse({ status: 200, description: 'Comensal encontrado, con si ya tiene pago aprobado' })
  @ApiResponse({ status: 404, description: 'PIN incorrecto, sesión no activa, o el comensal no existe en esta sesión' })
  reclamarComensal(@Param('sesionId') sesionId: string, @Body() dto: ReclamarComensalDto) {
    return this.comensalesService.reclamarComensal(sesionId, dto)
  }

  @Get()
  @ApiOperation({ summary: 'Listar los comensales de una sesión' })
  @ApiResponse({ status: 200, description: 'Lista de comensales de la sesión' })
  listarComensales(@Param('sesionId') sesionId: string) {
    return this.comensalesService.listarComensales(sesionId)
  }

  @Patch('cantidad-comensales')
  @ApiOperation({ summary: 'Fijar (o volver a null) la cantidad de comensales esperada de la sesión' })
  @ApiResponse({ status: 200, description: 'Cantidad de comensales actualizada' })
  @ApiResponse({ status: 404, description: 'Sesión no encontrada' })
  @ApiResponse({ status: 409, description: 'Sesión congelada' })
  setCantidadComensales(
    @Param('sesionId') sesionId: string,
    @Body() dto: SetCantidadComensalesDto,
  ) {
    return this.comensalesService.setCantidadComensales(sesionId, dto)
  }

  @Post('etiquetas')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Etiquetar un ítem del pedido con un comensal' })
  @ApiResponse({ status: 201, description: 'Ítem etiquetado (o ya estaba etiquetado con ese comensal)' })
  @ApiResponse({ status: 404, description: 'Comensal o ítem no encontrado en esta sesión' })
  @ApiResponse({
    status: 409,
    description: 'Sesión congelada: el ítem no es huérfano, o el comensal destino ya tiene pago aprobado',
  })
  etiquetarItem(@Param('sesionId') sesionId: string, @Body() dto: EtiquetarItemDto) {
    return this.comensalesService.etiquetarItem(sesionId, dto)
  }

  @Delete('etiquetas/:pedidoItemId/:comensalId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quitar la etiqueta de un comensal en un ítem del pedido' })
  @ApiResponse({ status: 200, description: 'Etiqueta eliminada' })
  @ApiResponse({ status: 404, description: 'Comensal, ítem o asignación no encontrada en esta sesión' })
  @ApiResponse({ status: 409, description: 'Sesión congelada' })
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
  @ApiResponse({ status: 200, description: 'Monto a pagar por cada comensal según lo que consumió, más los ítems huérfanos' })
  @ApiResponse({ status: 400, description: 'Sin comensales registrados' })
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

  @Delete(':comensalId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borrar un comensal creado por otro comensal (nunca uno auto-registrado)' })
  @ApiResponse({ status: 200, description: 'Comensal borrado, sus ítems vuelven a la bolsa común' })
  @ApiResponse({ status: 400, description: 'El comensal es auto-registrado y no puede borrarse desde acá' })
  @ApiResponse({ status: 403, description: 'El solicitante no es quien creó a este comensal' })
  @ApiResponse({ status: 404, description: 'Comensal no encontrado en esta sesión' })
  @ApiResponse({ status: 409, description: 'Sesión congelada, o el comensal tiene pago aprobado' })
  borrarComensal(
    @Param('sesionId') sesionId: string,
    @Param('comensalId') comensalId: string,
    @Query('solicitante', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    solicitante: string,
  ) {
    return this.comensalesService.borrarComensal(sesionId, comensalId, solicitante)
  }
}
