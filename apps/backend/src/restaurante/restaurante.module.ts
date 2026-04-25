import { Module } from '@nestjs/common'
import { RestauranteService } from './restaurante.service'
import { RestauranteController } from './restaurante.controller'

@Module({
  providers: [RestauranteService],
  controllers: [RestauranteController],
})
export class RestauranteModule {}
