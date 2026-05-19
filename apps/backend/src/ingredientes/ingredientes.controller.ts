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
import { IngredientesService } from './ingredientes.service'
import { CreateIngredienteDto } from './dto/create-ingrediente.dto'
import { UpdateIngredienteDto } from './dto/update-ingrediente.dto'

@ApiTags('ingredientes')
@ApiBearerAuth()
@Controller('ingredientes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER', 'GERENTE')
export class IngredientesController {
  constructor(private readonly ingredientes: IngredientesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear ingrediente' })
  @ApiResponse({ status: 201, description: 'Ingrediente creado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  create(@Body() dto: CreateIngredienteDto, @CurrentUser() user: JwtPayload) {
    return this.ingredientes.create(dto, user)
  }

  @Get()
  @ApiOperation({ summary: 'Listar ingredientes de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de ingredientes' })
  findAll(@Query('restauranteId') restauranteId: string, @CurrentUser() user: JwtPayload) {
    return this.ingredientes.findAll(restauranteId, user)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un ingrediente por ID' })
  @ApiResponse({ status: 200, description: 'Ingrediente encontrado' })
  @ApiResponse({ status: 404, description: 'Ingrediente no encontrado' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ingredientes.findOne(id, user)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un ingrediente' })
  @ApiResponse({ status: 200, description: 'Ingrediente actualizado' })
  @ApiResponse({ status: 404, description: 'Ingrediente no encontrado' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIngredienteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ingredientes.update(id, dto, user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un ingrediente' })
  @ApiResponse({ status: 204, description: 'Ingrediente eliminado' })
  @ApiResponse({ status: 404, description: 'Ingrediente no encontrado' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.ingredientes.remove(id, user)
  }
}
