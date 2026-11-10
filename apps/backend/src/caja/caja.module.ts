import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { CajasController } from './cajas.controller'
import { CajasService } from './cajas.service'

// La caja (#357): cajas, turnos, movimientos y arqueo. El modelo de datos es el de #355.
@Module({
  imports: [PrismaModule],
  controllers: [CajasController],
  providers: [CajasService],
})
export class CajaModule {}
