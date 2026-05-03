import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

export class UpdateSubcategoriaDto {
  @ApiPropertyOptional({ example: 'Empanadas' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number
}
