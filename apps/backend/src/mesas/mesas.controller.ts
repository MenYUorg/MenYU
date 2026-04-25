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
import { MesasService } from './mesas.service'
import { CreateMesaDto } from './dto/create-mesa.dto'
import { UpdateMesaDto } from './dto/update-mesa.dto'

@Controller('mesas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MesasController {
  constructor(private readonly mesas: MesasService) {}

  @Post()
  @Roles('ROOT', 'OWNER')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMesaDto) {
    return this.mesas.create(dto)
  }

  @Get()
  @Roles('ROOT', 'OWNER')
  findAll(@Query('restauranteId') restauranteId: string, @CurrentUser() user: JwtPayload) {
    return this.mesas.findAll(restauranteId, user)
  }

  @Get(':id')
  @Roles('ROOT', 'OWNER')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.mesas.findOne(id, user)
  }

  @Patch(':id')
  @Roles('ROOT', 'OWNER')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMesaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.mesas.update(id, dto, user)
  }

  @Delete(':id')
  @Roles('ROOT', 'OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.mesas.remove(id, user)
  }

  @Post(':id/regenerar-qr')
  @Roles('ROOT', 'OWNER')
  @HttpCode(HttpStatus.OK)
  regenerarQr(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.mesas.regenerarQr(id, user)
  }
}
