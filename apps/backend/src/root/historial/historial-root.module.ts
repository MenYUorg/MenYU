import { Module } from '@nestjs/common'
import { HistorialRootService } from './historial-root.service'

// Aparte de RootModule porque también registran las invitaciones de ROOT (InvitacionesModule). PrismaService es global.
@Module({
  providers: [HistorialRootService],
  exports: [HistorialRootService],
})
export class HistorialRootModule {}
