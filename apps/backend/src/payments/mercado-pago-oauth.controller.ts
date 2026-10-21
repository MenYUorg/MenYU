import { Controller, Get, Query, Res } from '@nestjs/common'
import { Response } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { RequiereRolEn } from '../auth/decorators/requiere-rol.decorator'
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

@ApiTags('payments')
@Controller('payments/mercadopago/oauth')
export class MercadoPagoOAuthController {
  constructor(private readonly oauth: MercadoPagoOAuthService) {}

  // Devuelve la URL (no redirige): el panel la pide con su token y después navega. OWNER o GERENTE del restaurante.
  @Get('conectar')
  @RequiereRolEn({ query: 'restauranteId' }, ...ADMINISTRACION)
  async conectar(@Query('restauranteId') restauranteId: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    return { url: await this.oauth.buildAuthUrl(restauranteId, usuario) }
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
