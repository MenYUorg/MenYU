import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { ApiBody, ApiConsumes } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { logoFilePipe, logoInterceptor } from '../storage/logo-upload'
import { RestauranteService } from './restaurante.service'
import { UpdateRestauranteDto } from './dto/update-restaurante.dto'

// OWNER y GERENTE del restaurante de :id (el logo, solo el OWNER). Crear y dar de baja restaurantes es de la consola
// de ROOT (/root/restaurantes).
@Controller('restaurantes')
export class RestauranteController {
  constructor(private readonly restaurantes: RestauranteService) {}

  @Get()
  @Personal()
  findAll(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.restaurantes.findAll(usuario)
  }

  @Get(':id')
  @RequiereRolEn({ param: 'id' }, ...ADMINISTRACION)
  findOne(@Param('id') id: string) {
    return this.restaurantes.findOne(id)
  }

  @Patch(':id')
  @RequiereRolEn({ param: 'id' }, ...ADMINISTRACION)
  update(@Param('id') id: string, @Body() dto: UpdateRestauranteDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.restaurantes.update(id, dto, usuario)
  }

  @Post(':id/logo')
  @RequiereRolEn({ param: 'id' }, 'OWNER')
  @UseInterceptors(logoInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } },
  })
  uploadLogo(@Param('id') id: string, @UploadedFile(logoFilePipe()) file: Express.Multer.File) {
    return this.restaurantes.uploadLogo(id, file)
  }

  @Delete(':id/logo')
  @RequiereRolEn({ param: 'id' }, 'OWNER')
  removeLogo(@Param('id') id: string) {
    return this.restaurantes.removeLogo(id)
  }
}
