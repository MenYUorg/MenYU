import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsNumber, IsUUID, Max, Min, ValidateIf, ValidateNested } from 'class-validator'
import { TextoOpcional } from '../../common/texto-libre'

/** El tope de una columna Decimal(10,2): un valor mayor desborda en la base (un 500). */
export const MAX_MONTO = 99_999_999.99
export const MAX_CAJAS_POR_TURNO = 2
export const MAX_OBSERVACIONES_TURNO = 500
export const MAX_ASIGNACIONES_POR_TURNO = 500

export class CajaDeLaAperturaDto {
  @ApiProperty({ example: '6f1c2a40-5555-4a1b-9c3d-000000000001' })
  @IsUUID()
  cajaId!: string

  @ApiProperty({ example: 20000, minimum: 0, maximum: MAX_MONTO, description: 'Hasta 2 decimales' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONTO)
  fondoInicial!: number
}

export class AsignacionDeMesaDto {
  @ApiProperty({ example: '6f1c2a40-4444-4a1b-9c3d-000000000001' })
  @IsUUID()
  mesaId!: string

  @ApiProperty({ example: '6f1c2a40-3333-4a1b-9c3d-000000000006' })
  @IsUUID()
  mozoId!: string
}

export class AbrirTurnoDto {
  @ApiProperty({ example: '6f1c2a40-1111-4a1b-9c3d-000000000001' })
  @IsUUID()
  restauranteId!: string

  @ApiProperty({ type: [CajaDeLaAperturaDto], minItems: 1, maxItems: MAX_CAJAS_POR_TURNO })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CAJAS_POR_TURNO)
  @ArrayUnique((c: CajaDeLaAperturaDto) => c?.cajaId, { message: 'Hay una caja repetida' })
  @ValidateNested({ each: true })
  @Type(() => CajaDeLaAperturaDto)
  cajas!: CajaDeLaAperturaDto[]

  @ApiPropertyOptional({
    type: [AsignacionDeMesaDto],
    maxItems: MAX_ASIGNACIONES_POR_TURNO,
    description: 'Sin este campo, se precargan desde las mesas asignadas de cada mozo. Con [], el turno abre sin asignaciones.',
  })
  // Se valida siempre que venga: con @IsOptional() pasaría un null.
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsArray()
  @ArrayMaxSize(MAX_ASIGNACIONES_POR_TURNO)
  @ArrayUnique((a: AsignacionDeMesaDto) => a?.mesaId, { message: 'Hay una mesa repetida' })
  @ValidateNested({ each: true })
  @Type(() => AsignacionDeMesaDto)
  asignaciones?: AsignacionDeMesaDto[]

  @ApiPropertyOptional({ nullable: true, maxLength: MAX_OBSERVACIONES_TURNO })
  @TextoOpcional(MAX_OBSERVACIONES_TURNO)
  observaciones?: string | null
}
