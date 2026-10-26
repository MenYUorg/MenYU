import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { ApiBody, ApiConsumes } from '@nestjs/swagger'
import { Personal } from '../auth/decorators/personal.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { logoFilePipe, logoInterceptor } from '../storage/logo-upload'
import { MarcaService } from './marca.service'
import { UpdateMarcaDto } from './dto/update-marca.dto'

// Solo el OWNER de la marca: lo exige el service (ni GERENTE ni ROOT). Crear y dar de baja marcas es de la consola
// de ROOT (/root/marcas).
@Controller('marcas')
export class MarcaController {
  constructor(private readonly marcas: MarcaService) {}

  @Get()
  @Personal()
  findAll(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.marcas.findAll(usuario)
  }

  @Get(':id')
  @Personal()
  findOne(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.marcas.findOne(id, usuario)
  }

  @Patch(':id')
  @Personal()
  update(@Param('id') id: string, @Body() dto: UpdateMarcaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.marcas.update(id, dto, usuario)
  }

  @Post(':id/logo')
  @Personal()
  @UseInterceptors(logoInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } },
  })
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile(logoFilePipe()) file: Express.Multer.File,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.marcas.uploadLogo(id, file, usuario)
  }

  @Delete(':id/logo')
  @Personal()
  removeLogo(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.marcas.removeLogo(id, usuario)
  }
}
