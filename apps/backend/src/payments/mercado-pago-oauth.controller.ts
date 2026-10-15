import { Controller, Get, Query, Res } from '@nestjs/common'
import { Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

@ApiTags('payments')
@Controller('payments/mercadopago/oauth')
export class MercadoPagoOAuthController {
  constructor(private readonly oauth: MercadoPagoOAuthService) {}

  @Get('conectar')
  conectar(@Query('restauranteId') restauranteId: string, @Res() res: Response) {
    const url = this.oauth.buildAuthUrl(restauranteId)
    return res.redirect(url)
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') restauranteId: string,
    @Res() res: Response,
  ) {
    await this.oauth.handleCallback(code, restauranteId)
    return res.redirect(`${process.env.FRONTEND_ADMIN_URL}/configuracion/pagos?mp=conectado`)
  }
}
