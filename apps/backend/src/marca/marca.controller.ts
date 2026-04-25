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
import { MarcaService } from './marca.service'
import { CreateMarcaDto } from './dto/create-marca.dto'
import { UpdateMarcaDto } from './dto/update-marca.dto'

@Controller('marcas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarcaController {
  constructor(private readonly marcas: MarcaService) {}

  @Post()
  @Roles('ROOT')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMarcaDto) {
    return this.marcas.create(dto)
  }

  @Get()
  @Roles('ROOT', 'OWNER')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.marcas.findAll(user)
  }

  @Get(':id')
  @Roles('ROOT', 'OWNER')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.marcas.findOne(id, user)
  }

  @Patch(':id')
  @Roles('ROOT', 'OWNER')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMarcaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.marcas.update(id, dto, user)
  }

  @Delete(':id')
  @Roles('ROOT')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.marcas.remove(id)
  }
}
