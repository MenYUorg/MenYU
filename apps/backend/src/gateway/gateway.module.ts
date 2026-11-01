import { Module } from '@nestjs/common'
import { SessionAuthModule } from '../auth/session-auth.module'
import { AccesoDelSocket } from './acceso-del-socket.service'
import { MenyuGateway } from './menyu.gateway'

// VerificadorTokenSupabase, AccesoService y PrismaService vienen de módulos globales; el JwtService del token de mesa,
// de SessionAuthModule.
@Module({
  imports: [SessionAuthModule],
  providers: [MenyuGateway, AccesoDelSocket],
  exports: [MenyuGateway],
})
export class GatewayModule {}
