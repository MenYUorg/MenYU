import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { Personal } from '../auth/decorators/personal.decorator'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { ItemsService } from './items.service'
import { CreateItemDto } from './dto/create-item.dto'
import { UpdateItemDto } from './dto/update-item.dto'
import { SetDescuentoDto } from './dto/set-descuento.dto'
import { AddIngredienteDto } from './dto/add-ingrediente.dto'
import { UpdateIngredienteItemDto } from './dto/update-ingrediente-item.dto'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

// OWNER y GERENTE del restaurante (borrar un ítem, solo OWNER). En las rutas de un ítem, el service pide el rol.
@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  @RequiereRolEn({ body: 'restauranteId' }, ...ADMINISTRACION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear ítem de menú' })
  @ApiResponse({ status: 201, description: 'Ítem creado' })
  create(@Body() dto: CreateItemDto) {
    return this.items.create(dto)
  }

  @Get()
  @RequiereRolEn({ query: 'restauranteId' }, ...ADMINISTRACION)
  @ApiOperation({ summary: 'Listar ítems de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de ítems' })
  findAll(@Query('restauranteId') restauranteId: string, @Query('disponible') disponibleRaw: string | undefined) {
    const disponible = disponibleRaw === 'true' ? true : disponibleRaw === 'false' ? false : undefined
    return this.items.findAll(restauranteId, disponible)
  }

  @Get(':id')
  @Personal()
  @ApiOperation({ summary: 'Obtener un ítem por ID' })
  @ApiResponse({ status: 200, description: 'Ítem encontrado' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  findOne(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.items.findOne(id, usuario)
  }

  @Patch(':id')
  @Personal()
  @ApiOperation({ summary: 'Actualizar un ítem' })
  @ApiResponse({ status: 200, description: 'Ítem actualizado' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.items.update(id, dto, usuario)
  }

  @Delete(':id')
  @Personal()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un ítem (solo el OWNER)' })
  @ApiResponse({ status: 204, description: 'Ítem eliminado' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  async remove(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.items.remove(id, usuario)
  }

  // ── Descuento ──────────────────────────────────────────────────────────

  @Put(':id/descuento')
  @Personal()
  @ApiOperation({
    summary: 'Poner un ítem en descuento, por precio o por porcentaje (solo uno de los dos)',
  })
  @ApiResponse({ status: 200, description: 'Ítem con el descuento aplicado' })
  @ApiResponse({ status: 400, description: 'Descuento inválido' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  setDescuento(@Param('id') id: string, @Body() dto: SetDescuentoDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.items.setDescuento(id, dto, usuario)
  }

  @Delete(':id/descuento')
  @Personal()
  @ApiOperation({ summary: 'Quitar el descuento de un ítem' })
  @ApiResponse({ status: 200, description: 'Ítem sin descuento' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  removeDescuento(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.items.removeDescuento(id, usuario)
  }

  // ── Imagen ─────────────────────────────────────────────────────────────

  @Post(':id/imagen')
  @Personal()
  // El límite corta la subida en multer (413): la ruta solo autentica y el rol se pide en el service, con el archivo ya leído.
  @UseInterceptors(FileInterceptor('imagen', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_SIZE } }))
  @ApiOperation({ summary: 'Subir imagen de un ítem (jpeg, png, webp — máx 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { imagen: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Imagen subida' })
  @ApiResponse({ status: 400, description: 'Archivo inválido o muy grande' })
  uploadImagen(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.items.uploadImagen(id, file, usuario)
  }

  @Delete(':id/imagen')
  @Personal()
  @ApiOperation({ summary: 'Eliminar imagen de un ítem' })
  @ApiResponse({ status: 200, description: 'Imagen eliminada' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  removeImagen(@Param('id') id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.items.removeImagen(id, usuario)
  }

  // ── Ingredientes del ítem ──────────────────────────────────────────────

  @Post(':itemId/ingredientes')
  @Personal()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar ingrediente a un ítem' })
  @ApiResponse({ status: 201, description: 'Ingrediente agregado' })
  @ApiResponse({ status: 404, description: 'Ítem o ingrediente no encontrado' })
  addIngrediente(
    @Param('itemId') itemId: string,
    @Body() dto: AddIngredienteDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.items.addIngrediente(itemId, dto, usuario)
  }

  @Patch(':itemId/ingredientes/:id')
  @Personal()
  @ApiOperation({ summary: 'Actualizar ingrediente de un ítem' })
  @ApiResponse({ status: 200, description: 'Ingrediente actualizado' })
  @ApiResponse({ status: 404, description: 'Relación ítem-ingrediente no encontrada' })
  updateIngrediente(
    @Param('itemId') itemId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIngredienteItemDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.items.updateIngrediente(itemId, id, dto, usuario)
  }

  @Delete(':itemId/ingredientes/:id')
  @Personal()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar ingrediente de un ítem' })
  @ApiResponse({ status: 204, description: 'Ingrediente quitado' })
  @ApiResponse({ status: 404, description: 'Relación ítem-ingrediente no encontrada' })
  async removeIngrediente(
    @Param('itemId') itemId: string,
    @Param('id') id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    await this.items.removeIngrediente(itemId, id, usuario)
  }
}
