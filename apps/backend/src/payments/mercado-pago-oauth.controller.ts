import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/auth.service'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

@ApiTags('payments')
@Controller('payments/mercadopago/oauth')
export class MercadoPagoOAuthController {
  constructor(private readonly oauth: MercadoPagoOAuthService) {}

  // Devuelve la URL (no redirige): el panel la pide con su JWT y después navega.
  @Get('conectar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'GERENTE')
  @ApiBearerAuth()
  async conectar(@Query('restauranteId') restauranteId: string, @CurrentUser() user: JwtPayload) {
    return { url: await this.oauth.buildAuthUrl(restauranteId, user) }
  }

  // Mercado Pago vuelve acá con el navegador, sin JWT: el restaurante sale del state firmado.
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.oauth.handleCallback(code, state)
    return res.redirect(`${process.env.FRONTEND_ADMIN_URL}/configuracion/pagos?mp=conectado`)
  }
}
