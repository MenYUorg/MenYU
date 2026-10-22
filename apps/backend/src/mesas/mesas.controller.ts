import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION, SALON } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { MesasService } from './mesas.service'
import { CreateMesaDto } from './dto/create-mesa.dto'
import { UpdateMesaDto } from './dto/update-mesa.dto'
import { CambiarPinDto } from './dto/cambiar-pin.dto'

// OWNER y GERENTE del restaurante (borrar, solo OWNER); el listado también lo ve el salón. En las rutas de una
// mesa, el service pide el rol.
@Controller('mesas')
export class MesasController {
  constructor(private readonly mesas: MesasService) {}

  @Post()
  @RequiereRolEn({ body: 'restauranteId' }, ...ADMINISTRACION)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMesaDto) {
    return this.mesas.create(dto)
  }

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...SALON)
  findAll(@Query('restauranteId') restauranteId: string) {
    return this.mesas.findAll(restauranteId)
  }

  @Get(':id')
  @Personal()
  findOne(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mesas.findOne(id, usuario)
  }

  @Patch(':id')
  @Personal()
  update(@Param('id') id: string, @Body() dto: UpdateMesaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mesas.update(id, dto, usuario)
  }

  @Delete(':id')
  @Personal()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.mesas.remove(id, usuario)
  }

  @Post(':id/regenerar-qr')
  @Personal()
  @HttpCode(HttpStatus.OK)
  regenerarQr(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mesas.regenerarQr(id, usuario)
  }

  @Patch(':id/pin')
  @Personal()
  cambiarPin(@Param('id') id: string, @Body() dto: CambiarPinDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.mesas.cambiarPin(id, dto.pin, usuario)
  }
}
