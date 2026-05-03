import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsNumber, IsOptional, IsPositive } from 'class-validator'

export class UpdateIngredienteItemDto {
  @ApiPropertyOptional({ example: 2.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  cantidad?: number

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  removible?: boolean

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  esOriginal?: boolean
}
