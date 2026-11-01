import { Module } from '@nestjs/common'
import { InformacionLocalController } from './informacion-local.controller'
import { InformacionLocalService } from './informacion-local.service'

// PrismaService y AccesoService vienen de módulos globales (PrismaModule, SupabaseAuthModule).
@Module({
  controllers: [InformacionLocalController],
  providers: [InformacionLocalService],
})
export class InformacionLocalModule {}
