import { Controller, Get, Param } from '@nestjs/common'
import { MarcaService } from './marca.service'

@Controller('marca')
export class MarcaPublicController {
  constructor(private readonly marcas: MarcaService) {}

  @Get('publicas')
  findAllPublicas() {
    return this.marcas.findAllPublicas()
  }

  @Get(':id/restaurantes')
  findRestaurantesByMarca(@Param('id') id: string) {
    return this.marcas.findRestaurantesByMarca(id)
  }
}
