import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, ValidateIf } from 'class-validator'
import { TextoObligatorio } from '../../common/texto-libre'
import { MAX_NOMBRE_COMANDA } from './crear-comanda.dto'

// Lo que no viene no cambia. Los dos se validan siempre que vengan: con @IsOptional() pasaría un null, y las columnas
// no lo admiten. Sin ninguno de los dos, el service responde 400.
export class ActualizarComandaDto {
  @ApiPropertyOptional({ example: 'Barra', maxLength: MAX_NOMBRE_COMANDA })
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @TextoObligatorio(MAX_NOMBRE_COMANDA)
  nombre?: string

  @ApiPropertyOptional({ example: false, description: 'Activa o desactiva la comanda. No se desactiva una con platos asignados.' })
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsBoolean()
  activa?: boolean
}
