import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export class ListarDuenosDto {
  @ApiPropertyOptional({ example: 'fiore', description: 'Busca por email del dueño o nombre de la marca (sin distinguir mayúsculas).' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  // PostgreSQL no acepta el carácter nulo en un texto: la consulta fallaría con un 500.
  @Matches(/^[^\x00]*$/, { message: 'q tiene caracteres no válidos' })
  q?: string
}
