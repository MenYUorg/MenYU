import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsUUID } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { ClasificacionesService } from './clasificaciones.service'

class CreateClasificacionDto {
  @ApiProperty({ example: 'Vegano' })
  @IsString()
  @IsNotEmpty()
  nombre!: string
}

class UpdateClasificacionDto {
  @ApiProperty({ example: 'Vegetariano' })
  @IsString()
  @IsNotEmpty()
  nombre!: string
}

class AddClasificacionItemDto {
  @ApiProperty({ example: 'uuid-de-clasificacion' })
  @IsUUID()
  clasificacionId!: string
}

// El listado es público. El catálogo lo editan el OWNER y el GERENTE de cualquier restaurante (es global); las
// clasificaciones de un ítem, los de su restaurante. El rol lo pide el service.
@ApiTags('clasificaciones')
@Controller('clasificaciones')
export class ClasificacionesController {
  constructor(private readonly clasificaciones: ClasificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar clasificaciones de dieta de un restaurante' })
  @ApiQuery({ name: 'restauranteId', required: true })
  @ApiResponse({ status: 200, description: 'Lista de clasificaciones' })
  findAll(@Query('restauranteId') restauranteId: string) {
    return this.clasificaciones.findAll(restauranteId)
  }

  @Post()
  @Personal()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear clasificación de dieta' })
  @ApiResponse({ status: 201, description: 'Clasificación creada' })
  @ApiResponse({ status: 409, description: 'Ya existe esa clasificación' })
  create(@Body() dto: CreateClasificacionDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.clasificaciones.create(dto.nombre, usuario)
  }

  @Patch(':id')
  @Personal()
  @ApiOperation({ summary: 'Actualizar nombre de clasificación' })
  @ApiResponse({ status: 200, description: 'Clasificación actualizada' })
  @ApiResponse({ status: 404, description: 'Clasificación no encontrada' })
  update(@Param('id') id: string, @Body() dto: UpdateClasificacionDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.clasificaciones.update(id, dto.nombre, usuario)
  }

  @Delete(':id')
  @Personal()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar clasificación (solo si no tiene ítems asignados)' })
  @ApiResponse({ status: 204, description: 'Clasificación eliminada' })
  @ApiResponse({ status: 409, description: 'La clasificación está en uso' })
  async remove(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.clasificaciones.remove(id, usuario)
  }

  // ── Asignación a ítems ─────────────────────────────────────────────────

  @Post('items/:itemId')
  @Personal()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Asignar clasificación a un ítem' })
  @ApiResponse({ status: 201, description: 'Clasificación asignada' })
  addToItem(
    @Param('itemId') itemId: string,
    @Body() dto: AddClasificacionItemDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.clasificaciones.addToItem(itemId, dto.clasificacionId, usuario)
  }

  @Delete('items/:itemId/:clasificacionId')
  @Personal()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desasignar clasificación de un ítem' })
  @ApiResponse({ status: 204, description: 'Clasificación desasignada' })
  async removeFromItem(
    @Param('itemId') itemId: string,
    @Param('clasificacionId') clasificacionId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    await this.clasificaciones.removeFromItem(itemId, clasificacionId, usuario)
  }
}
