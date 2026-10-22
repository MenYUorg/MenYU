import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRoot } from '../../auth/decorators/requiere-root.decorator'
import { UsuarioActual } from '../../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { IdPipe } from '../comun/cuentas'
import { CrearCuentaDto } from '../comun/dto/crear-cuenta.dto'
import { RootRootsService } from './root-roots.service'

/**
 * Cuentas ROOT. Solo ROOT. A propósito NO hay `DELETE /root/roots/:id`: las cuentas ROOT no se borran desde la app ni la API
 * (decisión 15 de docs/plan-consola-root.md). Un test recorre el enrutador y falla si aparece una ruta para borrarlas.
 */
@ApiTags('root')
@Controller('root/roots')
@RequiereRoot()
export class RootRootsController {
  constructor(private readonly roots: RootRootsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las cuentas ROOT (marca cuál es la propia)' })
  @ApiResponse({ status: 200 })
  listar(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.roots.listar(usuario)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crea una cuenta ROOT',
    description: 'Igual que un dueño: sin `password` genera una contraseña temporal y la devuelve una sola vez. La persona la cambia en su primer ingreso.',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Email ya en uso' })
  crear(@Body() dto: CrearCuentaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.roots.crear(dto, usuario)
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
  restablecerPassword(@Param('id', new IdPipe('Cuenta ROOT no encontrada')) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.roots.restablecerPassword(id, usuario)
  }
}
