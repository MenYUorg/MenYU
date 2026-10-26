import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { UsuarioActual } from './decorators/usuario-actual.decorator'
import { SupabaseAuthGuard } from './guards/supabase-auth.guard'
import { GuestDto } from './dto/guest.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { RegisterDto } from './dto/register.dto'
import { AccesoService } from './supabase/acceso.service'
import { UsuarioAutenticado } from './supabase/usuario-autenticado'

// TODO: proteger logout con JwtAuthGuard cuando se terminen las pruebas

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly acceso: AccesoService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión con email y password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login exitoso — devuelve accessToken y refreshToken' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password)
  }

  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo cliente' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Cliente creado — devuelve accessToken y refreshToken' })
  @ApiResponse({ status: 409, description: 'El email ya está registrado' })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body.nombre, body.email, body.password, body.telefono)
  }

  @Post('guest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión como invitado (sin cuenta)' })
  @ApiBody({ type: GuestDto })
  @ApiResponse({ status: 200, description: 'Sesión de invitado creada — devuelve accessToken y refreshToken' })
  guest(@Body() body: GuestDto) {
    return this.auth.loginAsGuest(body.nombre)
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar accessToken usando el refreshToken' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Tokens renovados' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido o expirado' })
  refresh(@Body() body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken)
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión — revoca el refreshToken' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 204, description: 'Sesión cerrada' })
  logout(@Body() body: RefreshTokenDto) {
    return this.auth.logout(body.refreshToken)
  }

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
