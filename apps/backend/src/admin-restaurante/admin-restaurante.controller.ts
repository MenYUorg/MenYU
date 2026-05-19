import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { AdminRestauranteService } from './admin-restaurante.service'

@ApiTags('admin-restaurante')
@ApiBearerAuth()
@Controller('admin-restaurante')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER')
export class AdminRestauranteController {
  constructor(private readonly service: AdminRestauranteService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Asignar restaurante a un gerente' })
  @ApiResponse({ status: 201, description: 'Asignación creada' })
  @ApiResponse({ status: 409, description: 'Ya tiene acceso' })
  asignar(
    @Body() body: { adminId: string; restauranteId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.asignar(body.adminId, body.restauranteId, user)
  }

  @Delete(':adminId/:restauranteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desasignar restaurante de un gerente' })
  @ApiResponse({ status: 204 })
  async desasignar(
    @Param('adminId') adminId: string,
    @Param('restauranteId') restauranteId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.service.desasignar(adminId, restauranteId, user)
  }

  @Get(':adminId')
  @ApiOperation({ summary: 'Listar restaurantes asignados a un gerente' })
  @ApiResponse({ status: 200 })
  findByAdmin(@Param('adminId') adminId: string, @CurrentUser() user: JwtPayload) {
    return this.service.findByAdmin(adminId, user)
  }

  @Get()
  @ApiOperation({ summary: 'Listar gerentes de una marca con sus restaurantes asignados' })
  @ApiResponse({ status: 200 })
  findGerentesByMarca(@Query('marcaId') marcaId: string, @CurrentUser() user: JwtPayload) {
    return this.service.findGerentesByMarca(marcaId, user)
  }
}
