import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ComandasController } from './comandas.controller'
import { ComandasService } from './comandas.service'

// Las comandas (#344): los puestos de preparación (cocina, barra…) a los que se asigna cada plato.
@Module({
  imports: [PrismaModule],
  controllers: [ComandasController],
  providers: [ComandasService],
})
export class ComandasModule {}
