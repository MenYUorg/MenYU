import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, IsPositive, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class UpdateIngredienteItemDto {
  @ApiPropertyOptional({ example: 2.0 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  cantidad?: number

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  esOriginal?: boolean

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  esRemovible?: boolean

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  esAgregable?: boolean

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  precioExtra?: number

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cantidadMin?: number

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  cantidadMax?: number
}
