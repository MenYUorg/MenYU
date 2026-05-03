import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator'

export class CreateCategoriaDto {
  @ApiProperty({ example: 'Entradas' })
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @ApiProperty({ example: 'uuid-del-restaurante' })
  @IsUUID()
  restauranteId!: string

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number
}
