import { Module } from '@nestjs/common'
import { InvitacionesController } from './invitaciones.controller'
import { InvitacionesService } from './invitaciones.service'

// PrismaService y los servicios de Supabase vienen de módulos globales (PrismaModule, SupabaseAuthModule).
@Module({
  controllers: [InvitacionesController],
  providers: [InvitacionesService],
})
export class InvitacionesModule {}
