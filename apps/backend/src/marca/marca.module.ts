import { Module } from '@nestjs/common'
import { MarcaService } from './marca.service'
import { MarcaController } from './marca.controller'
import { MarcaPublicController } from './marca.public.controller'
import { StorageModule } from '../storage/storage.module'

@Module({
  imports: [StorageModule],
  providers: [MarcaService],
  controllers: [MarcaController, MarcaPublicController],
})
export class MarcaModule {}
