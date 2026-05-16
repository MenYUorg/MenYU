import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class CreateIngredienteDto {
  @ApiProperty({ example: 'Tomate' })
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @ApiProperty({ example: 'uuid-del-restaurante' })
  @IsUUID()
  restauranteId!: string

  @ApiPropertyOptional({ example: false, description: 'Si el ingrediente es un alérgeno común' })
  @IsOptional()
  @IsBoolean()
  esAlergeno?: boolean
}
