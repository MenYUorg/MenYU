import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CategoriasService } from './categorias.service'
import { CreateCategoriaDto } from './dto/create-categoria.dto'
import { UpdateCategoriaDto } from './dto/update-categoria.dto'

// OWNER y GERENTE del restaurante (borrar una categoría, solo OWNER). En las rutas de una categoría, el service pide el rol.
@ApiTags('categorias')
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  @Post()
  @RequiereRolEn({ body: 'restauranteId' }, ...ADMINISTRACION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear categoría de menú' })
  @ApiResponse({ status: 201, description: 'Categoría creada' })
  create(@Body() dto: CreateCategoriaDto) {
    return this.categorias.create(dto)
  }

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...ADMINISTRACION)
  @ApiOperation({ summary: 'Listar categorías de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de categorías' })
  findAll(@Query('restauranteId') restauranteId: string) {
    return this.categorias.findAll(restauranteId)
  }

  @Get(':id')
  @Personal()
  @ApiOperation({ summary: 'Obtener una categoría por ID' })
  @ApiResponse({ status: 200, description: 'Categoría encontrada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  findOne(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.categorias.findOne(id, usuario)
  }

  @Patch(':id')
  @Personal()
  @ApiOperation({ summary: 'Actualizar una categoría' })
  @ApiResponse({ status: 200, description: 'Categoría actualizada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoriaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.categorias.update(id, dto, usuario)
  }

  @Delete(':id')
  @Personal()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una categoría (solo el OWNER)' })
  @ApiResponse({ status: 204, description: 'Categoría eliminada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  async remove(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.categorias.remove(id, usuario)
  }
}
