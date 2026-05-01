import { Module } from '@nestjs/common'
import { ItemsService } from './items.service'
import { ItemsController } from './items.controller'
import { RolesGuard } from '../common/guards/roles.guard'
import { StorageModule } from '../storage/storage.module'

@Module({
  imports: [StorageModule],
  providers: [ItemsService, RolesGuard],
  controllers: [ItemsController],
})
export class ItemsModule {}
