import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNumber, IsUUID, Max, Min } from 'class-validator'
import { TIPOS_MOVIMIENTO_CAJA, TipoMovimientoCaja } from '../../common/caja.constant'
import { TextoObligatorio } from '../../common/texto-libre'
import { MAX_MONTO } from './abrir-turno.dto'

export const MAX_MOTIVO_MOVIMIENTO = 200

/** Un ingreso o un egreso de efectivo en una caja abierta del turno. Quién lo carga sale de la cuenta. */
export class RegistrarMovimientoDto {
  @ApiProperty({ example: '6f1c2a40-5555-4a1b-9c3d-000000000001' })
  @IsUUID()
  cajaId!: string

  @ApiProperty({ enum: TIPOS_MOVIMIENTO_CAJA })
  @IsIn(TIPOS_MOVIMIENTO_CAJA)
  tipo!: TipoMovimientoCaja

  @ApiProperty({ example: 1500, minimum: 0.01, maximum: MAX_MONTO, description: 'Mayor a 0, hasta 2 decimales' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_MONTO)
  monto!: number

  @ApiProperty({ example: 'Compra de hielo', maxLength: MAX_MOTIVO_MOVIMIENTO })
  @TextoObligatorio(MAX_MOTIVO_MOVIMIENTO)
  motivo!: string
}
