import { Module } from '@nestjs/common'
import { MarcaService } from './marca.service'
import { MarcaController } from './marca.controller'

@Module({
  providers: [MarcaService],
  controllers: [MarcaController],
})
export class MarcaModule {}
