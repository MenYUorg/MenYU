import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { AperturaService } from './apertura.service'
import { AsignacionesController } from './asignaciones.controller'
import { CajasController } from './cajas.controller'
import { CajasService } from './cajas.service'
import { CierreController } from './cierre.controller'
import { CierreService } from './cierre.service'
import { MovimientosController } from './movimientos.controller'
import { MovimientosService } from './movimientos.service'
import { ReasignacionService } from './reasignacion.service'
import { ResumenController } from './resumen.controller'
import { ResumenService } from './resumen.service'
import { TurnosController } from './turnos.controller'

// La caja (#357): cajas, turnos, movimientos y arqueo. El modelo de datos es el de #355.
@Module({
  imports: [PrismaModule],
  controllers: [CajasController, TurnosController, AsignacionesController, MovimientosController, CierreController, ResumenController],
  providers: [CajasService, AperturaService, ReasignacionService, MovimientosService, CierreService, ResumenService],
})
export class CajaModule {}
