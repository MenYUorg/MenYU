import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthService, JwtPayload } from './auth.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { GuestDto } from './dto/guest.dto'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { RegisterDto } from './dto/register.dto'

// TODO: proteger logout con JwtAuthGuard cuando se terminen las pruebas

interface RequestWithUser extends Request {
  user: JwtPayload
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener datos del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Payload del JWT del usuario' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  me(@Req() req: RequestWithUser) {
    return req.user
  }
}
