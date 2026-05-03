import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

export class CreateSubcategoriaDto {
  @ApiProperty({ example: 'Tartas' })
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number
}
