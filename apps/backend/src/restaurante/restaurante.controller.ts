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
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { RestauranteService } from './restaurante.service'
import { CreateRestauranteDto } from './dto/create-restaurante.dto'
import { UpdateRestauranteDto } from './dto/update-restaurante.dto'

@Controller('restaurantes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RestauranteController {
  constructor(private readonly restaurantes: RestauranteService) {}

  @Post()
  @Roles('ROOT')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateRestauranteDto) {
    return this.restaurantes.create(dto)
  }

  @Get()
  @Roles('ROOT', 'OWNER', 'GERENTE')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.restaurantes.findAll(user)
  }

  @Get(':id')
  @Roles('ROOT', 'OWNER', 'GERENTE')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.restaurantes.findOne(id, user)
  }

  @Patch(':id')
  @Roles('ROOT', 'OWNER', 'GERENTE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRestauranteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.restaurantes.update(id, dto, user)
  }

  @Delete(':id')
  @Roles('ROOT')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.restaurantes.remove(id)
  }
}
