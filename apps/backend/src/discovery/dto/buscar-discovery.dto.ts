import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'
import { SinCaracterNulo } from '../../common/sin-caracter-nulo'

export const MIN_CARACTERES_BUSQUEDA = 2
export const MAX_CARACTERES_BUSQUEDA = 60

export class BuscarDiscoveryDto {
  @ApiProperty({
    example: 'cafe',
    description: `Texto a buscar (${MIN_CARACTERES_BUSQUEDA} a ${MAX_CARACTERES_BUSQUEDA} caracteres). Ignora mayúsculas y acentos.`,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Falta el texto a buscar (q)' })
  @MinLength(MIN_CARACTERES_BUSQUEDA, { message: `La búsqueda necesita al menos ${MIN_CARACTERES_BUSQUEDA} caracteres` })
  @MaxLength(MAX_CARACTERES_BUSQUEDA, { message: `La búsqueda admite hasta ${MAX_CARACTERES_BUSQUEDA} caracteres` })
  // PostgreSQL no acepta el carácter nulo en un texto: la consulta fallaría con un 500.
  @SinCaracterNulo({ message: 'El texto a buscar tiene caracteres no válidos' })
  q!: string
}
