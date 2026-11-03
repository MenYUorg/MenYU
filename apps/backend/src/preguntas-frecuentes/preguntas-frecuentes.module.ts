import { Module } from '@nestjs/common'
import { PreguntasFrecuentesController } from './preguntas-frecuentes.controller'
import { PreguntasFrecuentesService } from './preguntas-frecuentes.service'

// PrismaService y AccesoService vienen de módulos globales (PrismaModule, SupabaseAuthModule).
@Module({
  controllers: [PreguntasFrecuentesController],
  providers: [PreguntasFrecuentesService],
})
export class PreguntasFrecuentesModule {}
