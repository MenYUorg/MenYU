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
import { IngredientesService } from './ingredientes.service'
import { CreateIngredienteDto } from './dto/create-ingrediente.dto'
import { UpdateIngredienteDto } from './dto/update-ingrediente.dto'

@Controller('ingredientes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER')
export class IngredientesController {
  constructor(private readonly ingredientes: IngredientesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateIngredienteDto, @CurrentUser() user: JwtPayload) {
    return this.ingredientes.create(dto, user)
  }

  @Get()
  findAll(@Query('restauranteId') restauranteId: string, @CurrentUser() user: JwtPayload) {
    return this.ingredientes.findAll(restauranteId, user)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ingredientes.findOne(id, user)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIngredienteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ingredientes.update(id, dto, user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.ingredientes.remove(id, user)
  }
}
