import { Module } from '@nestjs/common'
import { MarcaService } from './marca.service'
import { MarcaController } from './marca.controller'
import { RolesGuard } from '../common/guards/roles.guard'

@Module({
  providers: [MarcaService, RolesGuard],
  controllers: [MarcaController],
})
export class MarcaModule {}
