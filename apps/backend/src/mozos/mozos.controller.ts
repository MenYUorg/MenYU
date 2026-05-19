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
import { MozosService } from './mozos.service'
import { CreateMozoDto } from './dto/create-mozo.dto'
import { UpdateMozoDto } from './dto/update-mozo.dto'

@ApiTags('mozos')
@ApiBearerAuth()
@Controller('mozos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER', 'GERENTE')
export class MozosController {
  constructor(private readonly mozos: MozosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear mozo' })
  @ApiResponse({ status: 201, description: 'Mozo creado' })
  create(@Body() dto: CreateMozoDto, @CurrentUser() user: JwtPayload) {
    return this.mozos.create(dto, user)
  }

  @Get()
  @ApiOperation({ summary: 'Listar mozos de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de mozos' })
  findAll(@Query('restauranteId') restauranteId: string, @CurrentUser() user: JwtPayload) {
    return this.mozos.findAll(restauranteId, user)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener mozo por ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.mozos.findOne(id, user)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar mozo' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMozoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.mozos.update(id, dto, user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar mozo (soft delete)' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.mozos.remove(id, user)
  }
}
