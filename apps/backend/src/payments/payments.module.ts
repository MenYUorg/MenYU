import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { GatewayModule } from '../gateway/gateway.module'
import { PaymentsService } from './payments.service'
import { PaymentsController } from './payments.controller'
import { CryptoService } from '../common/crypto.service'
import { MercadoPagoProvider } from './providers/mercado-pago.provider'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'
import { MercadoPagoOAuthController } from './mercado-pago-oauth.controller'

@Module({
  imports: [PrismaModule, GatewayModule],
  providers: [PaymentsService, CryptoService, MercadoPagoProvider, MercadoPagoOAuthService],
  controllers: [PaymentsController, MercadoPagoOAuthController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
