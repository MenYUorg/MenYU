import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { TODO_EL_PERSONAL } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PedidosService } from './pedidos.service'
import { CreatePedidoDto } from './dto/create-pedido.dto'
import { UpdateEstadoPedidoDto } from './dto/update-estado-pedido.dto'
import { EditPedidoDto } from './dto/edit-pedido.dto'

// POST /pedidos es del comensal (token de la sesión de mesa, verificado en el service). El resto, del personal: con el
// restaurante en la query lo exige la ruta; en las de un pedido, el service con el restaurante de su mesa.
@ApiTags('pedidos')
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...TODO_EL_PERSONAL)
  @ApiOperation({ summary: 'Listar pedidos por restaurante y estado' })
  listarPorEstado(
    @Query('restauranteId') restauranteId: string,
    @Query('estado') estado: string,
  ) {
    return this.pedidos.listarPorEstado(restauranteId, estado)
  }

  @Get('auditoria')
  @RequiereRolEn({ query: 'restauranteId' }, 'OWNER')
  @ApiOperation({ summary: 'Auditoría global de ediciones por restaurante (solo OWNER)' })
  @ApiResponse({ status: 200, description: 'Lista de ediciones de todos los pedidos del restaurante' })
  getAuditoria(
    @Query('restauranteId') restauranteId: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.pedidos.auditoriaEdiciones(restauranteId, desde, hasta)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Confirmar pedido desde el carrito del cliente' })
  @ApiResponse({ status: 201, description: 'Pedido creado' })
  @ApiResponse({ status: 401, description: 'Session JWT requerido o inválido' })
  @ApiResponse({ status: 400, description: 'Sesión no activa o modificador inválido' })
  @ApiResponse({ status: 404, description: 'Sesión, ítem o ingrediente no encontrado' })
  confirmar(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: CreatePedidoDto,
  ) {
    return this.pedidos.confirmar(authHeader, dto)
  }

  @Post('staff')
  @Personal()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear pedido desde el salón (OWNER, GERENTE, JEFE_SALON o MOZO) — va directo a en_preparacion' })
  @ApiResponse({ status: 201, description: 'Pedido creado' })
  @ApiResponse({ status: 404, description: 'Sesión, ítem o ingrediente no encontrado' })
  crearStaff(@Body() dto: CreatePedidoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.crearStaff(dto, usuario)
  }

  @Patch(':id/editar')
  @Personal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Editar ítems de un pedido con auditoría (GERENTE, JEFE_SALON o MOZO)' })
  @ApiResponse({ status: 200, description: 'Pedido actualizado con edición registrada' })
  @ApiResponse({ status: 400, description: 'Validación fallida o estado inválido' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  editarPedido(@Param('id') id: string, @Body() dto: EditPedidoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.editarPedido(id, dto, usuario)
  }

  @Get(':id/ediciones')
  @Personal()
  @ApiOperation({ summary: 'Historial de ediciones de un pedido (OWNER o GERENTE)' })
  @ApiResponse({ status: 200, description: 'Lista de ediciones' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  getEdiciones(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.pedidos.getEdiciones(id, usuario)
  }

  @Patch(':id/estado')
  @Personal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Avanzar el estado de un pedido (el personal del restaurante, también la cocina)' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 400, description: 'Transición de estado inválida' })
  @ApiResponse({ status: 404, description: 'Pedido no encontrado' })
  actualizarEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoPedidoDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.pedidos.actualizarEstado(id, dto, usuario)
  }
}
