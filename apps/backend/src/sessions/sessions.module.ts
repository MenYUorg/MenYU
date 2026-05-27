import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { UsersModule } from '../users/users.module'
import { GatewayModule } from '../gateway/gateway.module'
import { SessionsService } from './sessions.service'
import { SessionsController } from './sessions.controller'

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    GatewayModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET!,
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  providers: [SessionsService],
  controllers: [SessionsController],
})
export class SessionsModule {}
