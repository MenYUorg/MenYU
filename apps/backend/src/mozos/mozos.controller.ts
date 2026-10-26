import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { MozosService } from './mozos.service'
import { UpdateMozoDto } from './dto/update-mozo.dto'
import { AsignarMesaDto } from './dto/asignar-mesa.dto'

// OWNER y GERENTE del restaurante (editar y dar de baja, solo OWNER). En las rutas de un mozo, el service pide el
// rol. Los mozos se suman invitándolos (POST /auth/invitaciones).
@ApiTags('mozos')
@Controller('mozos')
export class MozosController {
  constructor(private readonly mozos: MozosService) {}

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...ADMINISTRACION)
  @ApiOperation({ summary: 'Listar mozos de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de mozos' })
  findAll(@Query('restauranteId') restauranteId: string) {
    return this.mozos.findAll(restauranteId)
  }

  @Get(':id')
  @Personal()
  @ApiOperation({ summary: 'Obtener mozo por ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mozos.findOne(id, usuario)
  }

  @Patch(':id')
  @Personal()
  @ApiOperation({ summary: 'Actualizar nombre y teléfono del mozo (solo el OWNER)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  update(@Param('id') id: string, @Body() dto: UpdateMozoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mozos.update(id, dto, usuario)
  }

  @Post(':mozoId/mesas')
  @Personal()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Asignar mesa permanente al mozo' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 404, description: 'Mozo o mesa no encontrado' })
  @ApiResponse({ status: 409, description: 'Mesa ya asignada al mozo' })
  assignMesa(@Param('mozoId') mozoId: string, @Body() dto: AsignarMesaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mozos.assignMesa(mozoId, dto.mesaId, usuario)
  }

  @Delete(':mozoId/mesas/:mesaId')
  @Personal()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar asignación permanente de mesa al mozo' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404 })
  async unassignMesa(
    @Param('mozoId') mozoId: string,
    @Param('mesaId') mesaId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    await this.mozos.unassignMesa(mozoId, mesaId, usuario)
  }

  @Get(':mozoId/mesas')
  @Personal()
  @ApiOperation({ summary: 'Listar mesas permanentes asignadas al mozo' })
  @ApiResponse({ status: 200 })
  getMesas(@Param('mozoId') mozoId: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mozos.getMesas(mozoId, usuario)
  }

  @Get(':mozoId/llamados-hoy')
  @Personal()
  @ApiOperation({ summary: 'Contador de llamados atendidos hoy por el mozo' })
  @ApiResponse({ status: 200 })
  llamadosHoy(@Param('mozoId') mozoId: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mozos.llamadosHoy(mozoId, usuario)
  }
}
