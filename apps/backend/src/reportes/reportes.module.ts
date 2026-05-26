import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ReportesService } from './reportes.service'
import { ReportesController } from './reportes.controller'

@Module({
  imports: [PrismaModule],
  providers: [ReportesService],
  controllers: [ReportesController],
})
export class ReportesModule {}
