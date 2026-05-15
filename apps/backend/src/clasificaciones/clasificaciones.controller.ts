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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsUUID } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
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
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ROOT', 'OWNER')
  @ApiOperation({ summary: 'Crear clasificación de dieta' })
  @ApiResponse({ status: 201, description: 'Clasificación creada' })
  @ApiResponse({ status: 409, description: 'Ya existe esa clasificación' })
  create(@Body() dto: CreateClasificacionDto, @CurrentUser() user: JwtPayload) {
    return this.clasificaciones.create(dto.nombre, user)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ROOT', 'OWNER')
  @ApiOperation({ summary: 'Actualizar nombre de clasificación' })
  @ApiResponse({ status: 200, description: 'Clasificación actualizada' })
  @ApiResponse({ status: 404, description: 'Clasificación no encontrada' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClasificacionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clasificaciones.update(id, dto.nombre, user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ROOT', 'OWNER')
  @ApiOperation({ summary: 'Eliminar clasificación (solo si no tiene ítems asignados)' })
  @ApiResponse({ status: 204, description: 'Clasificación eliminada' })
  @ApiResponse({ status: 409, description: 'La clasificación está en uso' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.clasificaciones.remove(id, user)
  }

  // ── Asignación a ítems ─────────────────────────────────────────────────

  @Post('items/:itemId')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ROOT', 'OWNER')
  @ApiOperation({ summary: 'Asignar clasificación a un ítem' })
  @ApiResponse({ status: 201, description: 'Clasificación asignada' })
  addToItem(
    @Param('itemId') itemId: string,
    @Body() dto: AddClasificacionItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clasificaciones.addToItem(itemId, dto.clasificacionId, user)
  }

  @Delete('items/:itemId/:clasificacionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ROOT', 'OWNER')
  @ApiOperation({ summary: 'Desasignar clasificación de un ítem' })
  @ApiResponse({ status: 204, description: 'Clasificación desasignada' })
  async removeFromItem(
    @Param('itemId') itemId: string,
    @Param('clasificacionId') clasificacionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.clasificaciones.removeFromItem(itemId, clasificacionId, user)
  }
}
