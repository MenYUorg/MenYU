import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRoot } from '../../auth/decorators/requiere-root.decorator'
import { UsuarioActual } from '../../auth/decorators/usuario-actual.decorator'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { CamposPermitidos, CamposPermitidosGuard } from '../comun/campos-permitidos.guard'
import { IdPipe } from '../comun/cuentas'
import { EditarRestauranteRootDto } from '../marcas/dto/marca-root.dto'
import { RootRestaurantesService } from './root-restaurantes.service'

/**
 * Restaurantes: cambiar el nombre y dar de baja o reactivar (crear está en `POST /root/marcas/:id/restaurantes`). Solo ROOT.
 * Ni la dirección, ni el logo, ni el modo de sesión: eso lo decide el dueño.
 */
@ApiTags('root')
@Controller('root/restaurantes')
@UseGuards(CamposPermitidosGuard)
// Debajo, para que los permisos corran antes que la validación de los campos (como en RootMarcasController).
@RequiereRoot()
export class RootRestaurantesController {
  constructor(private readonly restaurantes: RootRestaurantesService) {}

  @Patch(':id')
  @CamposPermitidos(['nombre'], 'La dirección, el logo, el modo de sesión y lo demás del restaurante los decide el dueño.')
  @ApiOperation({ summary: 'Cambia el nombre de un restaurante (solo el nombre)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Sin nombre, nombre inválido, o cualquier otro campo (no se ignora en silencio)' })
  @ApiResponse({ status: 404, description: 'El restaurante no existe' })
  editar(
    @Param('id', new IdPipe('Restaurante no encontrado')) id: string,
    @Body() dto: EditarRestauranteRootDto,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ) {
    return this.restaurantes.editar(id, dto, usuario)
  }

  @Post(':id/baja')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Da de baja un restaurante (reversible)',
    description: 'activo = false. No se borra nada. Idempotente. Por ahora solo lo saca de Discovery; el corte efectivo llega en la etapa 3.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'El restaurante no existe' })
  baja(@Param('id', new IdPipe('Restaurante no encontrado')) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.restaurantes.cambiarEstado(id, false, usuario)
  }

  @Post(':id/reactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactiva un restaurante dado de baja', description: 'Idempotente.' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'El restaurante no existe' })
  reactivar(@Param('id', new IdPipe('Restaurante no encontrado')) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.restaurantes.cambiarEstado(id, true, usuario)
  }
}
