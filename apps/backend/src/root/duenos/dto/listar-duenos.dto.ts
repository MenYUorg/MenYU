import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import { SinCaracterNulo } from '../../comun/sin-caracter-nulo'

export class ListarDuenosDto {
  @ApiPropertyOptional({ example: 'fiore', description: 'Busca por email del dueño o nombre de la marca (sin distinguir mayúsculas).' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  // PostgreSQL no acepta el carácter nulo en un texto: la consulta fallaría con un 500.
  @SinCaracterNulo({ message: 'q tiene caracteres no válidos' })
  q?: string
}
