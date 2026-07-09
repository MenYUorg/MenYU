import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { GatewayModule } from '../gateway/gateway.module'
import { PaymentsService } from './payments.service'
import { PaymentsController } from './payments.controller'

@Module({
  imports: [PrismaModule, GatewayModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
