import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { UsersModule } from './users/users.module'
import { AuthModule } from './auth/auth.module'
import { MarcaModule } from './marca/marca.module'
import { RestauranteModule } from './restaurante/restaurante.module'
import { MesasModule } from './mesas/mesas.module'
import { IngredientesModule } from './ingredientes/ingredientes.module'
import { CategoriasModule } from './categorias/categorias.module'
import { ItemsModule } from './items/items.module'

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, MarcaModule, RestauranteModule, MesasModule, IngredientesModule, CategoriasModule, ItemsModule],
})
export class AppModule {}
