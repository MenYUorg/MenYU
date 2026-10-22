import { Module } from '@nestjs/common'
import { CategoriasService } from './categorias.service'
import { CategoriasController } from './categorias.controller'

@Module({
  providers: [CategoriasService],
  controllers: [CategoriasController],
})
export class CategoriasModule {}
