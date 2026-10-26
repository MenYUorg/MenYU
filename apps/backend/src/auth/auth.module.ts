import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'

// Solo GET /auth/me. El guard y el AccesoService vienen de SupabaseAuthModule, que es @Global.
// El login propio (la tabla `admin` y las contraseñas de `mozo` y `cliente`) se retiró en la Fase 5 de
// docs/auth/specs/auth.md.
@Module({
  controllers: [AuthController],
})
export class AuthModule {}
