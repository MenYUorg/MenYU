import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ComensalesService } from './comensales.service'
import { DivisionService } from './division.service'
import { ComensalesController } from './comensales.controller'
import { SesionSaldoController } from './sesion-saldo.controller'

@Module({
  imports: [PrismaModule],
  providers: [ComensalesService, DivisionService],
  controllers: [ComensalesController, SesionSaldoController],
  exports: [ComensalesService, DivisionService],
})
export class ComensalesModule {}
