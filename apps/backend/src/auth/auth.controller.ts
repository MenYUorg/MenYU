import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { ApiBody, ApiTags } from '@nestjs/swagger'
import { AuthService, JwtPayload } from './auth.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'

// TODO: proteger logout con JwtAuthGuard cuando se terminen las pruebas
// TODO: eliminar todos los endpoints /dev antes de producción

interface RequestWithUser extends Request {
  user: JwtPayload
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginDto })
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password, body.tipo)
  }

  @Post('register')
  @ApiBody({ type: RegisterDto })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body.nombre, body.email, body.password, body.telefono)
  }

  @Post('guest')
  @HttpCode(HttpStatus.OK)
  guest(@Body() body: { nombre?: string }) {
    return this.auth.loginAsGuest(body.nombre)
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken)
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() body: { refreshToken: string }) {
    return this.auth.logout(body.refreshToken)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: RequestWithUser) {
    return req.user
  }

  // ── Dev (solo para pruebas — eliminar antes de producción) ──

  @Post('dev/seed')
  @HttpCode(HttpStatus.OK)
  devSeed() {
    return this.auth.devSeed()
  }

  @Post('dev/admin')
  @HttpCode(HttpStatus.CREATED)
  devCreateAdmin(
    @Body() body: { email: string; password: string; rol: string; restauranteId: string },
  ) {
    return this.auth.devCreateAdmin(body.email, body.password, body.rol, body.restauranteId)
  }

  @Post('dev/mozo')
  @HttpCode(HttpStatus.CREATED)
  devCreateMozo(
    @Body() body: { nombre: string; email: string; password: string; restauranteId: string },
  ) {
    return this.auth.devCreateMozo(body.nombre, body.email, body.password, body.restauranteId)
  }

  @Post('dev/root')
  @HttpCode(HttpStatus.OK)
  devCreateRoot() {
    return this.auth.devCreateRoot()
  }
}
