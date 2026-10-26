import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UsuarioActual } from '../decorators/usuario-actual.decorator'
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard'
import { UsuarioAutenticado } from '../supabase/usuario-autenticado'
import { CrearInvitacionDto } from './dto/crear-invitacion.dto'
import { InvitacionesService } from './invitaciones.service'

// Sin MembresiaGuard: el permiso depende del rol y del ámbito del body, y lo decide el service.
@ApiTags('auth')
@ApiBearerAuth('supabase')
@Controller('auth/invitaciones')
@UseGuards(SupabaseAuthGuard)
export class InvitacionesController {
  constructor(private readonly invitaciones: InvitacionesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Invitar a alguien del personal por email',
    description:
      'ROOT invita a OWNER; OWNER, a cualquier rol de su marca; GERENTE, a JEFE_SALON, MOZO y COCINA ' +
      'de sus restaurantes. OWNER va con marcaId; el resto, con restauranteId.',
  })
  @ApiResponse({ status: 201, description: 'Usuario y membresía creados (invitacionEnviada: si se mandó el mail)' })
  @ApiResponse({ status: 400, description: 'Datos inválidos, o marcaId/restauranteId que no corresponde al rol' })
  @ApiResponse({ status: 401, description: 'Sin token de Supabase, o token inválido o vencido' })
  @ApiResponse({ status: 403, description: 'Sin acceso a MenYU, o no puede invitar a ese rol ahí' })
  @ApiResponse({ status: 404, description: 'La marca o el restaurante no existe' })
  @ApiResponse({ status: 409, description: 'El usuario ya tiene un rol ahí o está desactivado' })
  @ApiResponse({ status: 502, description: 'Supabase rechazó la invitación' })
  invitar(@Body() dto: CrearInvitacionDto, @UsuarioActual() usuario: UsuarioAutenticado) {
    return this.invitaciones.invitar(dto, usuario)
  }
}
