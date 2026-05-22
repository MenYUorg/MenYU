import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { GatewayModule } from '../gateway/gateway.module'
import { WaiterCallsService } from './waiter-calls.service'
import { WaiterCallsController } from './waiter-calls.controller'

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
  providers: [WaiterCallsService],
  controllers: [WaiterCallsController],
})
export class WaiterCallsModule {}
