import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { UsersModule } from './users/users.module'
import { AuthModule } from './auth/auth.module'
import { MarcaModule } from './marca/marca.module'
import { RestauranteModule } from './restaurante/restaurante.module'

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, MarcaModule, RestauranteModule],
})
export class AppModule {}
