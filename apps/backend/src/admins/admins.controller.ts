import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { AdminsService } from './admins.service'
import { CreateAdminDto } from './dto/create-admin.dto'
import { UpdateAdminDto } from './dto/update-admin.dto'

@ApiTags('admins')
@ApiBearerAuth()
@Controller('admins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear gerente (OWNER crea solo GERENTE, ROOT puede cualquier rol)' })
  @ApiResponse({ status: 201, description: 'Admin creado sin passwordHash' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  create(@Body() dto: CreateAdminDto, @CurrentUser() user: JwtPayload) {
    return this.admins.create(dto, user)
  }

  @Get()
  @ApiOperation({ summary: 'Listar admins (ROOT ve todos, OWNER ve solo su marca)' })
  @ApiResponse({ status: 200 })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.admins.findAll(user)
  }

  @Patch(':id')
  @Roles('ROOT', 'OWNER')
  @ApiOperation({ summary: 'Actualizar admin (OWNER solo puede editar gerentes de su marca)' })
  @ApiResponse({ status: 200, description: 'Admin actualizado sin passwordHash' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Admin no encontrado' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.admins.update(id, dto, user)
  }

  @Delete(':id')
  @Roles('ROOT', 'OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar admin (OWNER solo puede eliminar gerentes de su marca)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'Admin no encontrado' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.admins.remove(id, user)
  }
}
