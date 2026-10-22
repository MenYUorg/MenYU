import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRoot } from '../../auth/decorators/requiere-root.decorator'
import { UsuarioActual } from '../../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { IdPipe } from '../comun/cuentas'
import { CambiarEmailDto, CrearCuentaDto } from '../comun/dto/crear-cuenta.dto'
import { ListarDuenosDto } from './dto/listar-duenos.dto'
import { RootDuenosService } from './root-duenos.service'

/** Cuentas OWNER ("dueños") de las marcas. Solo ROOT. Cada cambio queda en el historial dentro de la misma transacción. */
@ApiTags('root')
@Controller('root')
@RequiereRoot()
export class RootDuenosController {
  constructor(private readonly duenos: RootDuenosService) {}

  @Get('duenos')
  @ApiOperation({ summary: 'Lista las cuentas OWNER con su marca (q busca por email o nombre de la marca)' })
  @ApiResponse({ status: 200 })
  listar(@Query() dto: ListarDuenosDto) {
    return this.duenos.listar(dto)
  }

  @Post('marcas/:id/duenos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crea una cuenta OWNER en una marca',
    description:
      'Sin `password`, genera una contraseña temporal y la devuelve en `passwordTemporal`, SOLO en esta respuesta. El dueño tiene que cambiarla en su primer ingreso. Normaliza el email y rechaza el de otra cuenta, mozo o cliente.',
  })
  @ApiResponse({ status: 201, description: 'Dueño creado (con la contraseña generada, una sola vez)' })
  @ApiResponse({ status: 404, description: 'La marca no existe' })
  @ApiResponse({ status: 409, description: 'Email ya en uso, o la marca está dada de baja' })
  crear(@Param('id', new IdPipe('Marca no encontrada')) marcaId: string, @Body() dto: CrearCuentaDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.duenos.crear(marcaId, dto, usuario)
  }

  @Patch('duenos/:id')
  @ApiOperation({ summary: 'Cambia el email de un dueño (la contraseña no)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'No hay un dueño con ese id' })
  @ApiResponse({ status: 409, description: 'Email ya en uso' })
  cambiarEmail(@Param('id', new IdPipe('Dueño no encontrado')) id: string, @Body() dto: CambiarEmailDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.duenos.cambiarEmail(id, dto, usuario)
  }

  @Post('duenos/:id/restablecer-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Genera una contraseña nueva para un dueño',
    description:
      'La devuelve en `passwordTemporal`, SOLO en esta respuesta; marca la cuenta para cambiarla al entrar y cierra sus sesiones renovables.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'No hay un dueño con ese id' })
  restablecerPassword(@Param('id', new IdPipe('Dueño no encontrado')) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.duenos.restablecerPassword(id, usuario)
  }

  @Delete('duenos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina la cuenta de un dueño (no al último dueño de una marca activa)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'No hay un dueño con ese id' })
  @ApiResponse({ status: 409, description: 'Es el único dueño de una marca activa' })
  async eliminar(@Param('id', new IdPipe('Dueño no encontrado')) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    await this.duenos.eliminar(id, usuario)
  }
}
