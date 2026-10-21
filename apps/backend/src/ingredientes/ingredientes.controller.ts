import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { IngredientesService } from './ingredientes.service'
import { CreateIngredienteDto } from './dto/create-ingrediente.dto'
import { UpdateIngredienteDto } from './dto/update-ingrediente.dto'

// OWNER y GERENTE del restaurante. En las rutas de un ingrediente, el service pide el rol.
@ApiTags('ingredientes')
@Controller('ingredientes')
export class IngredientesController {
  constructor(private readonly ingredientes: IngredientesService) {}

  @Post()
  @RequiereRolEn({ body: 'restauranteId' }, ...ADMINISTRACION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear ingrediente' })
  @ApiResponse({ status: 201, description: 'Ingrediente creado' })
  create(@Body() dto: CreateIngredienteDto) {
    return this.ingredientes.create(dto)
  }

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...ADMINISTRACION)
  @ApiOperation({ summary: 'Listar ingredientes de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de ingredientes' })
  findAll(@Query('restauranteId') restauranteId: string) {
    return this.ingredientes.findAll(restauranteId)
  }

  @Get(':id')
  @Personal()
  @ApiOperation({ summary: 'Obtener un ingrediente por ID' })
  @ApiResponse({ status: 200, description: 'Ingrediente encontrado' })
  @ApiResponse({ status: 404, description: 'Ingrediente no encontrado' })
  findOne(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.ingredientes.findOne(id, usuario)
  }

  @Patch(':id')
  @Personal()
  @ApiOperation({ summary: 'Actualizar un ingrediente' })
  @ApiResponse({ status: 200, description: 'Ingrediente actualizado' })
  @ApiResponse({ status: 404, description: 'Ingrediente no encontrado' })
  update(@Param('id') id: string, @Body() dto: UpdateIngredienteDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.ingredientes.update(id, dto, usuario)
  }

  @Delete(':id')
  @Personal()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un ingrediente' })
  @ApiResponse({ status: 204, description: 'Ingrediente eliminado' })
  @ApiResponse({ status: 404, description: 'Ingrediente no encontrado' })
  async remove(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.ingredientes.remove(id, usuario)
  }
}
