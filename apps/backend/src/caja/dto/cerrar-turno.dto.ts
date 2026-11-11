import { applyDecorators } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDefined, IsNumber, IsUUID, Max, Min, ValidateNested } from 'class-validator'
import { MetodoArqueo } from '../../common/caja.constant'
import { TextoOpcional } from '../../common/texto-libre'
import { MAX_CAJAS_POR_TURNO, MAX_MONTO, MAX_OBSERVACIONES_TURNO } from './abrir-turno.dto'

/** Lo que se contó de un método al cerrar: de 0 al tope de Decimal(10,2), con hasta 2 decimales. Obligatorio. */
function MontoDeclarado(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ example: 0, minimum: 0, maximum: MAX_MONTO, description: 'Hasta 2 decimales; 0 si no hubo' }),
    IsNumber({ maxDecimalPlaces: 2 }),
    Min(0),
    Max(MAX_MONTO),
  )
}

/**
 * Lo declarado en cada método del arqueo. Implementa `Record<MetodoArqueo, number>`: si se suma un método a
 * METODOS_ARQUEO, esta clase no compila hasta que tenga su campo (y un unitario recorre la constante).
 */
export class DeclaradoDto implements Record<MetodoArqueo, number> {
  @MontoDeclarado()
  efectivo!: number

  @MontoDeclarado()
  debito!: number

  @MontoDeclarado()
  credito!: number

  @MontoDeclarado()
  transferencia!: number
}

export class CajaDelCierreDto {
  @ApiProperty({ example: '6f1c2a40-5555-4a1b-9c3d-000000000001' })
  @IsUUID()
  cajaId!: string

  @ApiProperty({ type: DeclaradoDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DeclaradoDto)
  declarado!: DeclaradoDto
}

/** El arqueo de cada caja abierta del turno: tienen que venir todas, y solo esas. */
export class CerrarTurnoDto {
  @ApiProperty({ type: [CajaDelCierreDto], minItems: 1, maxItems: MAX_CAJAS_POR_TURNO })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CAJAS_POR_TURNO)
  @ArrayUnique((c: CajaDelCierreDto) => c?.cajaId, { message: 'Hay una caja repetida' })
  @ValidateNested({ each: true })
  @Type(() => CajaDelCierreDto)
  cajas!: CajaDelCierreDto[]

  @ApiPropertyOptional({ nullable: true, maxLength: MAX_OBSERVACIONES_TURNO, description: 'Se suman a las del turno' })
  @TextoOpcional(MAX_OBSERVACIONES_TURNO)
  observaciones?: string | null
}
