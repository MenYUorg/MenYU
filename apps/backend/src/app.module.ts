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
import { SessionsModule } from './sessions/sessions.module'
import { MenuModule } from './menu/menu.module'
import { GatewayModule } from './gateway/gateway.module'
import { MozosModule } from './mozos/mozos.module'
import { ClasificacionesModule } from './clasificaciones/clasificaciones.module'
import { AdminRestauranteModule } from './admin-restaurante/admin-restaurante.module'
import { OrdersModule } from './orders/orders.module'
import { PaymentsModule } from './payments/payments.module'
import { PedidosModule } from './pedidos/pedidos.module'
import { WaiterCallsModule } from './waiter-calls/waiter-calls.module'
import { ReportesModule } from './reportes/reportes.module'
import { HealthController } from './health/health.controller'

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    MarcaModule,
    RestauranteModule,
    MesasModule,
    IngredientesModule,
    CategoriasModule,
    ItemsModule,
    SessionsModule,
    MenuModule,
    GatewayModule,
    MozosModule,
    ClasificacionesModule,
    AdminRestauranteModule,
    OrdersModule,
    PaymentsModule,
    PedidosModule,
    WaiterCallsModule,
    ReportesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

const x: number = "esto es un error de typescript"
