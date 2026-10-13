import { Module } from '@nestjs/common'
import { StorageService } from './storage.service'
import { LogosService } from './logos.service'

@Module({
  providers: [StorageService, LogosService],
  exports: [StorageService, LogosService],
})
export class StorageModule {}
