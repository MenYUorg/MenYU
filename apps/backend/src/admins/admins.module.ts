import { Module } from '@nestjs/common'
import { AdminsController } from './admins.controller'
import { AdminsService } from './admins.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
