import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateIngredienteDto {
  @ApiPropertyOptional({ example: 'Cebolla' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string
}
