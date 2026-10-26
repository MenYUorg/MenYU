import { Module } from '@nestjs/common'
import { PersonalController } from './personal.controller'
import { PersonalService } from './personal.service'

// PrismaService y AccesoService vienen de módulos globales (PrismaModule, SupabaseAuthModule).
@Module({
  controllers: [PersonalController],
  providers: [PersonalService],
})
export class PersonalModule {}
