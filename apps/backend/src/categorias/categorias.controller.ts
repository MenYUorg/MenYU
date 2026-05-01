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

@Controller('categorias')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  // ── Categorías ─────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCategoriaDto, @CurrentUser() user: JwtPayload) {
    return this.categorias.create(dto, user)
  }

  @Get()
  findAll(@Query('restauranteId') restauranteId: string, @CurrentUser() user: JwtPayload) {
    return this.categorias.findAll(restauranteId, user)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.categorias.findOne(id, user)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoriaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categorias.update(id, dto, user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.categorias.remove(id, user)
  }

  // ── Subcategorías ──────────────────────────────────────────────────────

  @Post(':categoriaId/subcategorias')
  @HttpCode(HttpStatus.CREATED)
  createSub(
    @Param('categoriaId') categoriaId: string,
    @Body() dto: CreateSubcategoriaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categorias.createSub(categoriaId, dto, user)
  }

  @Get(':categoriaId/subcategorias')
  findAllSubs(@Param('categoriaId') categoriaId: string, @CurrentUser() user: JwtPayload) {
    return this.categorias.findAllSubs(categoriaId, user)
  }

  @Get('subcategorias/:id')
  findOneSub(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.categorias.findOneSub(id, user)
  }

  @Patch('subcategorias/:id')
  updateSub(
    @Param('id') id: string,
    @Body() dto: UpdateSubcategoriaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categorias.updateSub(id, dto, user)
  }

  @Delete('subcategorias/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSub(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.categorias.removeSub(id, user)
  }
}
