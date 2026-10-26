import { Module } from '@nestjs/common'
import { MesasService } from './mesas.service'
import { MesasController } from './mesas.controller'

@Module({
  providers: [MesasService],
  controllers: [MesasController],
})
export class MesasModule {}
