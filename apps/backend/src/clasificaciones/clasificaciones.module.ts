import { Module } from '@nestjs/common'
import { ClasificacionesService } from './clasificaciones.service'
import { ClasificacionesController } from './clasificaciones.controller'
import { RolesGuard } from '../common/guards/roles.guard'

@Module({
  providers: [ClasificacionesService, RolesGuard],
  controllers: [ClasificacionesController],
  exports: [ClasificacionesService],
})
export class ClasificacionesModule {}
