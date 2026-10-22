import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RequiereRoot } from '../../auth/decorators/requiere-root.decorator'
import { ListarHistorialDto } from './dto/listar-historial.dto'
import { HistorialRootService } from './historial-root.service'

/**
 * El historial de acciones de ROOT. **Solo lectura, a propósito**: no hay ninguna ruta que lo edite o lo borre (un test recorre el
 * enrutador y falla si aparece), y la base lo impide con disparadores. Lo ven todos los ROOT; nadie más.
 */
@ApiTags('root')
@Controller('root/historial')
@RequiereRoot()
export class RootHistorialController {
  constructor(private readonly historial: HistorialRootService) {}

  @Get()
  @ApiOperation({
    summary: 'El historial de acciones de ROOT, de lo más nuevo a lo más viejo, de a 50',
    description:
      'Filtros opcionales: `actor` (email de una cuenta ROOT, o `script`), `entidad` (MARCA, RESTAURANTE, OWNER o ROOT), `desde` y `hasta` (YYYY-MM-DD, hora de Buenos Aires, los dos días incluidos). Para la página siguiente se manda `cursor` con el `siguiente` de la respuesta anterior.',
  })
  @ApiResponse({ status: 200, description: '{ items, siguiente } — `siguiente` es null cuando no hay más' })
  @ApiResponse({ status: 400, description: 'Un filtro inválido, una fecha que no existe, o desde posterior a hasta' })
  listar(@Query() filtros: ListarHistorialDto) {
    return this.historial.listar(filtros)
  }
}
