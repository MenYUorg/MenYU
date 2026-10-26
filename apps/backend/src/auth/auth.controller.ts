import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UsuarioActual } from './decorators/usuario-actual.decorator'
import { SupabaseAuthGuard } from './guards/supabase-auth.guard'
import { AccesoService } from './supabase/acceso.service'
import { UsuarioAutenticado } from './supabase/usuario-autenticado'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly acceso: AccesoService) {}

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth('supabase')
  @ApiOperation({ summary: 'Usuario autenticado con Supabase y sus membresías' })
  @ApiResponse({ status: 200, description: 'Usuario y membresías (la de OWNER trae los restaurantes activos de su marca)' })
  @ApiResponse({ status: 401, description: 'Sin token de Supabase, o token inválido o vencido' })
  @ApiResponse({ status: 403, description: 'La cuenta de Supabase no tiene acceso a MenYU' })
  me(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.acceso.perfil(usuario)
  }
}
