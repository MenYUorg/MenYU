import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION, TODO_EL_PERSONAL } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { ComandasService } from './comandas.service'
import { ActualizarComandaDto } from './dto/actualizar-comanda.dto'
import { CrearComandaDto } from './dto/crear-comanda.dto'

// Las comandas las ve todo el personal (la cocina las necesita) y las dan de alta y editan OWNER y GERENTE. En PATCH, el
// service resuelve el restaurante desde la comanda y pide el rol. No hay DELETE: se desactivan.
@ApiTags('comandas')
@Controller('comandas')
export class ComandasController {
  constructor(private readonly comandas: ComandasService) {}

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...TODO_EL_PERSONAL)
  @ApiOperation({ summary: 'Listar las comandas del restaurante, activas e inactivas' })
  @ApiResponse({ status: 200 })
  listar(@Query('restauranteId') restauranteId: string) {
    return this.comandas.listar(restauranteId)
  }

  @Post()
  @RequiereRolEn({ body: 'restauranteId' }, ...ADMINISTRACION)
  @ApiOperation({ summary: 'Crear una comanda' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Ya hay una comanda con ese nombre en el restaurante' })
  crear(@Body() dto: CrearComandaDto) {
    return this.comandas.crear(dto)
  }

  @Patch(':id')
  @Personal()
  @ApiOperation({ summary: 'Renombrar, activar o desactivar una comanda (OWNER y GERENTE)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Sin nada para actualizar' })
  @ApiResponse({ status: 404, description: 'Comanda no encontrada' })
  @ApiResponse({ status: 409, description: 'Nombre repetido, platos asignados o una operación simultánea' })
  actualizar(@Param('id') id: string, @Body() dto: ActualizarComandaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.comandas.actualizar(id, dto, usuario)
  }
}
