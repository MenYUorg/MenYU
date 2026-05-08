import { Module } from '@nestjs/common'
import { MozosController } from './mozos.controller'
import { MozosService } from './mozos.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [MozosController],
  providers: [MozosService],
})
export class MozosModule {}
