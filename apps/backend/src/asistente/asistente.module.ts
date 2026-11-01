import { Module } from '@nestjs/common'
import { SessionAuthModule } from '../auth/session-auth.module'
import { AsistenteController } from './asistente.controller'
import { AsistenteService } from './asistente.service'
import { ContextoService } from './contexto.service'
import { crearModeloDelAsistente, MODELO_DEL_ASISTENTE } from './modelo'
import { ProveedorService } from './proveedor.service'
import { RegistroAsistenteService } from './registro-asistente.service'

// El asistente de mesa (docs/asistente/specs/asistente.md): armado del contexto, llamada al modelo y registro, en
// services separados. PrismaService viene del módulo global; JwtService (token de mesa), de SessionAuthModule.
@Module({
  imports: [SessionAuthModule],
  controllers: [AsistenteController],
  providers: [
    AsistenteService,
    ContextoService,
    ProveedorService,
    RegistroAsistenteService,
    { provide: MODELO_DEL_ASISTENTE, useFactory: crearModeloDelAsistente },
  ],
})
export class AsistenteModule {}
