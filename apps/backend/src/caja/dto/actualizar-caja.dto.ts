import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, ValidateIf } from 'class-validator'
import { TextoObligatorio } from '../../common/texto-libre'
import { MAX_NOMBRE_CAJA } from './crear-caja.dto'

// Lo que no viene no cambia. Los dos se validan siempre que vengan: con @IsOptional() pasaría un null, y las columnas
// no lo admiten. Sin ninguno de los dos, el service responde 400.
export class ActualizarCajaDto {
  @ApiPropertyOptional({ example: 'Caja de la barra', maxLength: MAX_NOMBRE_CAJA })
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @TextoObligatorio(MAX_NOMBRE_CAJA)
  nombre?: string

  @ApiPropertyOptional({ example: false, description: 'Activa o desactiva la caja. No se desactiva una caja abierta.' })
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsBoolean()
  activa?: boolean
}
