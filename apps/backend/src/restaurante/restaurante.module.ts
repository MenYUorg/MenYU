import { Module } from '@nestjs/common'
import { RestauranteService } from './restaurante.service'
import { RestauranteController } from './restaurante.controller'
import { StorageModule } from '../storage/storage.module'

@Module({
  imports: [StorageModule],
  providers: [RestauranteService],
  controllers: [RestauranteController],
})
export class RestauranteModule {}
