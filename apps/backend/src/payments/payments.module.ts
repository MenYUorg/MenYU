import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { GatewayModule } from '../gateway/gateway.module'
import { PaymentsService } from './payments.service'
import { PaymentsController } from './payments.controller'
import { MercadoPagoProvider } from './providers/mercadopago.provider'

@Module({
  imports: [
    PrismaModule,
    GatewayModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET!,
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  providers: [
    PaymentsService,
    { provide: 'PAYMENT_PROVIDER', useClass: MercadoPagoProvider },
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
