import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateIngredienteDto {
  @ApiPropertyOptional({ example: 'Cebolla' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  esAlergeno?: boolean
}
