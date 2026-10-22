import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRol } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PersonalDelRestaurante, PersonalService } from './personal.service'

// OWNER o GERENTE del restaurante. A quién le puede quitar el acceso cada uno lo decide el service.
@ApiTags('personal')
@Controller('restaurantes/:restauranteId/personal')
@RequiereRol(...ADMINISTRACION)
export class PersonalController {
  constructor(private readonly personal: PersonalService) {}

  @Get()
  @ApiOperation({ summary: 'Quién tiene acceso al restaurante: dueños, miembros y mozos sin cuenta' })
  @ApiResponse({ status: 200, description: 'El personal del restaurante' })
  listar(@Param('restauranteId') restauranteId: string): Promise<PersonalDelRestaurante> {
    return this.personal.listar(restauranteId)
  }

  @Delete(':membresiaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitarle el acceso al restaurante a una persona (su membresía)' })
  @ApiResponse({ status: 204, description: 'Acceso quitado' })
  @ApiResponse({ status: 404, description: 'Esa persona no tiene acceso a este restaurante' })
  async quitarAcceso(
    @Param('restauranteId') restauranteId: string,
    @Param('membresiaId') membresiaId: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.personal.quitarAcceso(restauranteId, membresiaId, usuario)
  }
}
