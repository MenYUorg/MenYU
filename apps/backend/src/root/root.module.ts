import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { RootDuenosController } from './duenos/root-duenos.controller'
import { RootDuenosService } from './duenos/root-duenos.service'
import { HistorialRootService } from './historial/historial-root.service'
import { RootRootsController } from './roots/root-roots.controller'
import { RootRootsService } from './roots/root-roots.service'

/** Consola de ROOT (docs/plan-consola-root.md). Etapa 1a: dueños, cuentas ROOT y el registro del historial. */
@Module({
  imports: [PrismaModule],
  controllers: [RootDuenosController, RootRootsController],
  providers: [RootDuenosService, RootRootsService, HistorialRootService],
})
export class RootModule {}
