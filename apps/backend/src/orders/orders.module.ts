import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { GatewayModule } from '../gateway/gateway.module'
import { OrdersService } from './orders.service'
import { OrdersController } from './orders.controller'

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
  providers: [OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
