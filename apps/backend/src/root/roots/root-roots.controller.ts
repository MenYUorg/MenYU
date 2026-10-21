import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { JwtPayload } from '../../auth/auth.service'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { RolesGuard } from '../../common/guards/roles.guard'
import { IdPipe } from '../comun/cuentas'
import { CrearCuentaDto } from '../comun/dto/crear-cuenta.dto'
import { RootRootsService } from './root-roots.service'

/**
 * Cuentas ROOT. Solo ROOT. A propósito NO hay `DELETE /root/roots/:id`: las cuentas ROOT no se borran desde la app ni la API
 * (decisión 15 de docs/plan-consola-root.md). Un test recorre el enrutador y falla si aparece una ruta para borrarlas.
 */
@ApiTags('root')
@ApiBearerAuth()
@Controller('root/roots')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT')
export class RootRootsController {
  constructor(private readonly roots: RootRootsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las cuentas ROOT (marca cuál es la propia)' })
  @ApiResponse({ status: 200 })
  listar(@CurrentUser() user: JwtPayload) {
    return this.roots.listar(user)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crea una cuenta ROOT',
    description: 'Igual que un dueño: sin `password` genera una contraseña temporal y la devuelve una sola vez. La persona la cambia en su primer ingreso.',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Email ya en uso' })
  crear(@Body() dto: CrearCuentaDto, @CurrentUser() user: JwtPayload) {
    return this.roots.crear(dto, user)
  }

  @Post(':id/restablecer-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablece la contraseña de OTRA cuenta ROOT',
    description: 'La devuelve en `passwordTemporal`, SOLO en esta respuesta, y cierra las sesiones renovables de esa cuenta. Para la propia contraseña no sirve (400).',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Es la cuenta propia' })
  @ApiResponse({ status: 404, description: 'No hay una cuenta ROOT con ese id' })
  restablecerPassword(@Param('id', new IdPipe('Cuenta ROOT no encontrada')) id: string, @CurrentUser() user: JwtPayload) {
    return this.roots.restablecerPassword(id, user)
  }
}
