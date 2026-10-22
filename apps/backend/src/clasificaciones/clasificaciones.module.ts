import { Module } from '@nestjs/common'
import { ClasificacionesService } from './clasificaciones.service'
import { ClasificacionesController } from './clasificaciones.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [ClasificacionesService],
  controllers: [ClasificacionesController],
  exports: [ClasificacionesService],
})
export class ClasificacionesModule {}
