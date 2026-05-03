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

@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateItemDto, @CurrentUser() user: JwtPayload) {
    return this.items.create(dto, user)
  }

  @Get()
  findAll(
    @Query('marcaId') marcaId: string,
    @Query('subcategoriaId') subcategoriaId: string | undefined,
    @Query('disponible') disponibleRaw: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    const disponible =
      disponibleRaw === 'true' ? true : disponibleRaw === 'false' ? false : undefined
    return this.items.findAll(marcaId, user, subcategoriaId, disponible)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.items.findOne(id, user)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.items.update(id, dto, user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.items.remove(id, user)
  }

  // ── Imagen ─────────────────────────────────────────────────────────────

  @Post(':id/imagen')
  @UseInterceptors(FileInterceptor('imagen', { storage: memoryStorage() }))
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
  removeImagen(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.items.removeImagen(id, user)
  }

  // ── Ingredientes del ítem ──────────────────────────────────────────────

  @Post(':itemId/ingredientes')
  @HttpCode(HttpStatus.CREATED)
  addIngrediente(
    @Param('itemId') itemId: string,
    @Body() dto: AddIngredienteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.items.addIngrediente(itemId, dto, user)
  }

  @Patch(':itemId/ingredientes/:id')
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
  async removeIngrediente(
    @Param('itemId') itemId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.items.removeIngrediente(itemId, id, user)
  }
}
