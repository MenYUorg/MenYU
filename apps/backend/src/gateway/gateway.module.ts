import { Module } from '@nestjs/common'
import { SessionAuthModule } from '../auth/session-auth.module'
import { MenyuGateway } from './menyu.gateway'

@Module({
  imports: [SessionAuthModule],
  providers: [MenyuGateway],
  exports: [MenyuGateway],
})
export class GatewayModule {}
