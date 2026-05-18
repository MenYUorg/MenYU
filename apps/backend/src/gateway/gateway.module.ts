import { Module } from '@nestjs/common'
import { MenyuGateway } from './menyu.gateway'

@Module({
  providers: [MenyuGateway],
  exports: [MenyuGateway],
})
export class GatewayModule {}
