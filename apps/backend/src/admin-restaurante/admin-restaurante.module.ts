import { Module } from '@nestjs/common'
import { AdminRestauranteController } from './admin-restaurante.controller'
import { AdminRestauranteService } from './admin-restaurante.service'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [AdminRestauranteController],
  providers: [AdminRestauranteService],
  exports: [AdminRestauranteService],
})
export class AdminRestauranteModule {}
