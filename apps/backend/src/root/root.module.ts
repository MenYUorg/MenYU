import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { RootDuenosController } from './duenos/root-duenos.controller'
import { RootDuenosService } from './duenos/root-duenos.service'
import { HistorialRootModule } from './historial/historial-root.module'
import { RootHistorialController } from './historial/root-historial.controller'
import { RootMarcasController } from './marcas/root-marcas.controller'
import { RootMarcasService } from './marcas/root-marcas.service'
import { RootRestaurantesController } from './restaurantes/root-restaurantes.controller'
import { RootRestaurantesService } from './restaurantes/root-restaurantes.service'
import { RootRootsController } from './roots/root-roots.controller'
import { RootRootsService } from './roots/root-roots.service'

/**
 * Consola de ROOT (docs/plan-consola-root.md): marcas, restaurantes, dueños, cuentas ROOT y el historial de acciones.
 * Todo `/root/*` es solo para ROOT y cada cambio queda registrado en el historial dentro de su transacción.
 */
@Module({
  imports: [PrismaModule, HistorialRootModule],
  controllers: [RootMarcasController, RootRestaurantesController, RootDuenosController, RootRootsController, RootHistorialController],
  providers: [RootMarcasService, RootRestaurantesService, RootDuenosService, RootRootsService],
})
export class RootModule {}
