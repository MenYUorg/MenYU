import { Module } from '@nestjs/common'
import { HistorialRootModule } from '../../root/historial/historial-root.module'
import { InvitacionesController } from './invitaciones.controller'
import { InvitacionesService } from './invitaciones.service'

// PrismaService y los servicios de Supabase vienen de módulos globales (PrismaModule, SupabaseAuthModule). La consola de
// ROOT usa InvitacionesService para invitar dueños y cuentas ROOT.
@Module({
  imports: [HistorialRootModule],
  controllers: [InvitacionesController],
  providers: [InvitacionesService],
  exports: [InvitacionesService],
})
export class InvitacionesModule {}
