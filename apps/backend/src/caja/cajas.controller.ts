import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION, CAJA } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CajasService } from './cajas.service'
import { ActualizarCajaDto } from './dto/actualizar-caja.dto'
import { CrearCajaDto } from './dto/crear-caja.dto'

// Las cajas las ve el grupo CAJA (OWNER, GERENTE y JEFE_SALON) y las dan de alta y editan OWNER y GERENTE. En PATCH, el
// service resuelve el restaurante desde la caja y pide el rol.
@ApiTags('cajas')
@Controller('cajas')
export class CajasController {
  constructor(private readonly cajas: CajasService) {}

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...CAJA)
  @ApiOperation({ summary: 'Listar las cajas del restaurante, activas e inactivas' })
  @ApiResponse({ status: 200 })
  listar(@Query('restauranteId') restauranteId: string) {
    return this.cajas.listar(restauranteId)
  }

  @Post()
  @RequiereRolEn({ body: 'restauranteId' }, ...ADMINISTRACION)
  @ApiOperation({ summary: 'Crear una caja' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Ya hay una caja con ese nombre en el restaurante' })
  crear(@Body() dto: CrearCajaDto) {
    return this.cajas.crear(dto)
  }

  @Patch(':id')
  @Personal()
  @ApiOperation({ summary: 'Renombrar, activar o desactivar una caja (OWNER y GERENTE)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Sin nada para actualizar' })
  @ApiResponse({ status: 404, description: 'Caja no encontrada' })
  @ApiResponse({ status: 409, description: 'Nombre repetido, caja abierta o una operación simultánea' })
  actualizar(@Param('id') id: string, @Body() dto: ActualizarCajaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.cajas.actualizar(id, dto, usuario)
  }
}
