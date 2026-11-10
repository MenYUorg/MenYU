import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AperturaService } from './apertura.service'
import { AsignacionesController } from './asignaciones.controller'
import { CajasController } from './cajas.controller'
import { CajasService } from './cajas.service'
import { MovimientosController } from './movimientos.controller'
import { MovimientosService } from './movimientos.service'
import { ReasignacionService } from './reasignacion.service'
import { TurnosController } from './turnos.controller'

// La caja (#357): cajas, turnos, movimientos y arqueo. El modelo de datos es el de #355.
@Module({
  imports: [PrismaModule],
  controllers: [CajasController, TurnosController, AsignacionesController, MovimientosController],
  providers: [CajasService, AperturaService, ReasignacionService, MovimientosService],
})
export class CajaModule {}
