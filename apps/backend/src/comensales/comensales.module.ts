import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ComensalesService } from './comensales.service'
import { DivisionService } from './division.service'
import { ComensalesController } from './comensales.controller'

@Module({
  imports: [PrismaModule],
  providers: [ComensalesService, DivisionService],
  controllers: [ComensalesController],
  exports: [ComensalesService, DivisionService],
})
export class ComensalesModule {}
