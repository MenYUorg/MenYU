import { Module } from '@nestjs/common'
import { ClasificacionesService } from './clasificaciones.service'
import { ClasificacionesController } from './clasificaciones.controller'
import { RolesGuard } from '../common/guards/roles.guard'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [ClasificacionesService, RolesGuard],
  controllers: [ClasificacionesController],
  exports: [ClasificacionesService],
})
export class ClasificacionesModule {}
