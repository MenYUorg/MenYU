import { Module } from '@nestjs/common'
import { IngredientesService } from './ingredientes.service'
import { IngredientesController } from './ingredientes.controller'

@Module({
  providers: [IngredientesService],
  controllers: [IngredientesController],
})
export class IngredientesModule {}
