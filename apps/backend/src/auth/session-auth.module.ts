import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { SessionAuthGuard } from './guards/session-auth.guard'

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET!,
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  providers: [SessionAuthGuard],
  exports: [SessionAuthGuard, JwtModule],
})
export class SessionAuthModule {}
