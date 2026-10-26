import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRoot } from '../../auth/decorators/requiere-root.decorator'
import { UsuarioActual } from '../../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { CamposPermitidos, CamposPermitidosGuard } from '../comun/campos-permitidos.guard'
import { IdPipe } from '../comun/cuentas'
import { RootRestaurantesService } from '../restaurantes/root-restaurantes.service'
import { CrearMarcaRootDto, CrearRestauranteRootDto, EditarMarcaRootDto, ListarMarcasDto } from './dto/marca-root.dto'
import { RootMarcasService } from './root-marcas.service'

const MOTIVO_MARCA = 'El logo de la marca lo carga el dueño.'
const MOTIVO_RESTAURANTE = 'El resto de los datos del restaurante (logo, modo de sesión…) los decide el dueño.'

/**
 * Marcas, y los restaurantes que se crean dentro de una marca. Solo ROOT. Una baja es lógica y reversible: no se borra nada.
 * Cada cambio queda en el historial dentro de la misma transacción.
 */
@ApiTags('root')
@Controller('root/marcas')
@UseGuards(CamposPermitidosGuard)
// Debajo de CamposPermitidosGuard: los decoradores de clase se aplican de abajo hacia arriba y los permisos tienen que correr
// antes que la validación de los campos (un OWNER con un campo de más recibe 403, no 400).
@RequiereRoot()
export class RootMarcasController {
  constructor(
    private readonly marcas: RootMarcasService,
    private readonly restaurantes: RootRestaurantesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista las marcas con cuántos restaurantes y dueños tienen (bajas=true incluye las dadas de baja)' })
  @ApiResponse({ status: 200 })
  listar(@Query() dto: ListarMarcasDto) {
    return this.marcas.listar(dto)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @CamposPermitidos(['nombre', 'slug'], MOTIVO_MARCA)
  @ApiOperation({ summary: 'Crea una marca (nombre e identificador)' })
  @ApiResponse({ status: 201, description: 'La marca, con el detalle' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o un campo que ROOT no puede enviar' })
  @ApiResponse({ status: 409, description: 'El identificador (slug) ya lo usa otra marca, también de baja' })
  crear(@Body() dto: CrearMarcaRootDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.marcas.crear(dto, usuario)
  }

  @Get(':id')
  @ApiOperation({ summary: 'El detalle de una marca: datos, restaurantes (dirección de solo lectura) y dueños' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'La marca no existe' })
  detalle(@Param('id', new IdPipe('Marca no encontrada')) id: string) {
    return this.marcas.detalle(id)
  }

  @Patch(':id')
  @CamposPermitidos(['nombre', 'slug'], MOTIVO_MARCA)
  @ApiOperation({ summary: 'Cambia el nombre y/o el identificador de una marca (también si está dada de baja)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Sin nada para cambiar, datos inválidos o un campo que ROOT no puede enviar' })
  @ApiResponse({ status: 404, description: 'La marca no existe' })
  @ApiResponse({ status: 409, description: 'El identificador ya lo usa otra marca' })
  editar(@Param('id', new IdPipe('Marca no encontrada')) id: string, @Body() dto: EditarMarcaRootDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.marcas.editar(id, dto, usuario)
  }

  @Post(':id/baja')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Da de baja una marca (reversible)',
    description: 'activo = false. No se borra nada. Idempotente: si ya estaba de baja no cambia ni se registra. Por ahora solo la saca de Discovery; el corte efectivo llega en la etapa 3.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'La marca no existe' })
  baja(@Param('id', new IdPipe('Marca no encontrada')) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.marcas.cambiarEstado(id, false, usuario)
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactiva una marca dada de baja', description: 'Vuelve todo como estaba. Idempotente.' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'La marca no existe' })
  reactivar(@Param('id', new IdPipe('Marca no encontrada')) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.marcas.cambiarEstado(id, true, usuario)
  }

  @Post(':id/restaurantes')
  @HttpCode(HttpStatus.CREATED)
  @CamposPermitidos(['nombre', 'direccion'], MOTIVO_RESTAURANTE)
  @ApiOperation({
    summary: 'Crea un restaurante activo en una marca',
    description: 'La dirección la carga ROOT esta única vez (es obligatoria); después solo la cambia el dueño.',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 400, description: 'Datos inválidos o un campo que ROOT no puede enviar' })
  @ApiResponse({ status: 404, description: 'La marca no existe' })
  @ApiResponse({ status: 409, description: 'La marca está dada de baja' })
  crearRestaurante(
    @Param('id', new IdPipe('Marca no encontrada')) id: string,
    @Body() dto: CrearRestauranteRootDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.restaurantes.crear(id, dto, usuario)
  }
}
