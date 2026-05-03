import { Module } from '@nestjs/common'
import { CategoriasService } from './categorias.service'
import { CategoriasController } from './categorias.controller'
import { RolesGuard } from '../common/guards/roles.guard'

@Module({
  providers: [CategoriasService, RolesGuard],
  controllers: [CategoriasController],
})
export class CategoriasModule {}
