import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { CategoriasService } from './categorias.service'
import { CreateCategoriaDto } from './dto/create-categoria.dto'
import { UpdateCategoriaDto } from './dto/update-categoria.dto'
import { CreateSubcategoriaDto } from './dto/create-subcategoria.dto'
import { UpdateSubcategoriaDto } from './dto/update-subcategoria.dto'

@ApiTags('categorias')
@ApiBearerAuth()
@Controller('categorias')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER', 'GERENTE')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  // ── Categorías ─────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear categoría de menú' })
  @ApiResponse({ status: 201, description: 'Categoría creada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  create(@Body() dto: CreateCategoriaDto, @CurrentUser() user: JwtPayload) {
    return this.categorias.create(dto, user)
  }

  @Get()
  @ApiOperation({ summary: 'Listar categorías de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de categorías' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  findAll(@Query('restauranteId') restauranteId: string, @CurrentUser() user: JwtPayload) {
    return this.categorias.findAll(restauranteId, user)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una categoría por ID' })
  @ApiResponse({ status: 200, description: 'Categoría encontrada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.categorias.findOne(id, user)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una categoría' })
  @ApiResponse({ status: 200, description: 'Categoría actualizada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoriaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categorias.update(id, dto, user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una categoría' })
  @ApiResponse({ status: 204, description: 'Categoría eliminada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.categorias.remove(id, user)
  }

  // ── Subcategorías ──────────────────────────────────────────────────────

  @Post(':categoriaId/subcategorias')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear subcategoría dentro de una categoría' })
  @ApiResponse({ status: 201, description: 'Subcategoría creada' })
  @ApiResponse({ status: 404, description: 'Categoría no encontrada' })
  createSub(
    @Param('categoriaId') categoriaId: string,
    @Body() dto: CreateSubcategoriaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categorias.createSub(categoriaId, dto, user)
  }

  @Get(':categoriaId/subcategorias')
  @ApiOperation({ summary: 'Listar subcategorías de una categoría' })
  @ApiResponse({ status: 200, description: 'Lista de subcategorías' })
  findAllSubs(@Param('categoriaId') categoriaId: string, @CurrentUser() user: JwtPayload) {
    return this.categorias.findAllSubs(categoriaId, user)
  }

  @Get('subcategorias/:id')
  @ApiOperation({ summary: 'Obtener una subcategoría por ID' })
  @ApiResponse({ status: 200, description: 'Subcategoría encontrada' })
  @ApiResponse({ status: 404, description: 'Subcategoría no encontrada' })
  findOneSub(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.categorias.findOneSub(id, user)
  }

  @Patch('subcategorias/:id')
  @ApiOperation({ summary: 'Actualizar una subcategoría' })
  @ApiResponse({ status: 200, description: 'Subcategoría actualizada' })
  @ApiResponse({ status: 404, description: 'Subcategoría no encontrada' })
  updateSub(
    @Param('id') id: string,
    @Body() dto: UpdateSubcategoriaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categorias.updateSub(id, dto, user)
  }

  @Delete('subcategorias/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una subcategoría' })
  @ApiResponse({ status: 204, description: 'Subcategoría eliminada' })
  @ApiResponse({ status: 404, description: 'Subcategoría no encontrada' })
  async removeSub(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.categorias.removeSub(id, user)
  }
}
