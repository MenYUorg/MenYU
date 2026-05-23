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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { ItemsService } from './items.service'
import { CreateItemDto } from './dto/create-item.dto'
import { UpdateItemDto } from './dto/update-item.dto'
import { AddIngredienteDto } from './dto/add-ingrediente.dto'
import { UpdateIngredienteItemDto } from './dto/update-ingrediente-item.dto'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER', 'GERENTE')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear ítem de menú' })
  @ApiResponse({ status: 201, description: 'Ítem creado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  create(@Body() dto: CreateItemDto, @CurrentUser() user: JwtPayload) {
    return this.items.create(dto, user)
  }

  @Get()
  @ApiOperation({ summary: 'Listar ítems de un restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de ítems' })
  findAll(
    @Query('restauranteId') restauranteId: string,
    @Query('disponible') disponibleRaw: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const disponible =
      disponibleRaw === 'true' ? true : disponibleRaw === 'false' ? false : undefined
    return this.items.findAll(restauranteId, user, disponible)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un ítem por ID' })
  @ApiResponse({ status: 200, description: 'Ítem encontrado' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.items.findOne(id, user)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un ítem' })
  @ApiResponse({ status: 200, description: 'Ítem actualizado' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.items.update(id, dto, user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un ítem' })
  @ApiResponse({ status: 204, description: 'Ítem eliminado' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.items.remove(id, user)
  }

  // ── Imagen ─────────────────────────────────────────────────────────────

  @Post(':id/imagen')
  @UseInterceptors(FileInterceptor('imagen', { storage: memoryStorage() }))
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
    @CurrentUser() user: JwtPayload,
  ) {
    return this.items.uploadImagen(id, file, user)
  }

  @Delete(':id/imagen')
  @ApiOperation({ summary: 'Eliminar imagen de un ítem' })
  @ApiResponse({ status: 200, description: 'Imagen eliminada' })
  @ApiResponse({ status: 404, description: 'Ítem no encontrado' })
  removeImagen(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.items.removeImagen(id, user)
  }

  // ── Ingredientes del ítem ──────────────────────────────────────────────

  @Post(':itemId/ingredientes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar ingrediente a un ítem' })
  @ApiResponse({ status: 201, description: 'Ingrediente agregado' })
  @ApiResponse({ status: 404, description: 'Ítem o ingrediente no encontrado' })
  addIngrediente(
    @Param('itemId') itemId: string,
    @Body() dto: AddIngredienteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.items.addIngrediente(itemId, dto, user)
  }

  @Patch(':itemId/ingredientes/:id')
  @ApiOperation({ summary: 'Actualizar ingrediente de un ítem' })
  @ApiResponse({ status: 200, description: 'Ingrediente actualizado' })
  @ApiResponse({ status: 404, description: 'Relación ítem-ingrediente no encontrada' })
  updateIngrediente(
    @Param('itemId') itemId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIngredienteItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.items.updateIngrediente(itemId, id, dto, user)
  }

  @Delete(':itemId/ingredientes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar ingrediente de un ítem' })
  @ApiResponse({ status: 204, description: 'Ingrediente quitado' })
  @ApiResponse({ status: 404, description: 'Relación ítem-ingrediente no encontrada' })
  async removeIngrediente(
    @Param('itemId') itemId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.items.removeIngrediente(itemId, id, user)
  }
}
