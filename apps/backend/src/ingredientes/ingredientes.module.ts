import { Module } from '@nestjs/common'
import { IngredientesService } from './ingredientes.service'
import { IngredientesController } from './ingredientes.controller'
import { RolesGuard } from '../common/guards/roles.guard'

@Module({
  providers: [IngredientesService, RolesGuard],
  controllers: [IngredientesController],
})
export class IngredientesModule {}
