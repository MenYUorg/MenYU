import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { GatewayModule } from '../gateway/gateway.module'
import { PedidosService } from './pedidos.service'
import { PedidosController } from './pedidos.controller'

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
  providers: [PedidosService],
  controllers: [PedidosController],
})
export class PedidosModule {}
