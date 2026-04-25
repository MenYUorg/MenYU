import { Module } from '@nestjs/common'
import { MesasService } from './mesas.service'
import { MesasController } from './mesas.controller'
import { RolesGuard } from '../common/guards/roles.guard'

@Module({
  providers: [MesasService, RolesGuard],
  controllers: [MesasController],
})
export class MesasModule {}
