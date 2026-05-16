import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsDecimal, IsInt, IsOptional, IsPositive, IsUUID, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class AddIngredienteDto {
  @ApiProperty({ example: 'uuid-del-ingrediente' })
  @IsUUID()
  ingredienteId!: string

  @ApiProperty({ example: true, description: 'Si el ingrediente es parte del plato original' })
  @IsBoolean()
  esOriginal!: boolean

  @ApiProperty({ example: 1, description: 'Cantidad en la unidad del ingrediente' })
  @Type(() => Number)
  @IsPositive()
  cantidad!: number

  @ApiPropertyOptional({ example: true, description: 'Si el cliente puede quitar este ingrediente' })
  @IsOptional()
  @IsBoolean()
  esRemovible?: boolean

  @ApiPropertyOptional({ example: false, description: 'Si el cliente puede agregar más de este ingrediente' })
  @IsOptional()
  @IsBoolean()
  esAgregable?: boolean

  @ApiPropertyOptional({ example: 0.5, description: 'Precio adicional al agregar este ingrediente' })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  precioExtra?: number

  @ApiPropertyOptional({ example: 0, description: 'Cantidad mínima que el cliente puede pedir' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cantidadMin?: number

  @ApiPropertyOptional({ example: 3, description: 'Cantidad máxima que el cliente puede agregar' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  cantidadMax?: number
}
