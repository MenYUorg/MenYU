import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator'
import { SinCaracterNulo } from '../../comun/sin-caracter-nulo'

export const MAX_NOMBRE = 120
export const MAX_SLUG = 80
export const MAX_DIRECCION = 200

/** Minúsculas, números y guiones sueltos: `la-parrilla-de-juan`. Es un identificador interno (no está en ninguna ruta ni pantalla). */
export const FORMA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
const recortarEnMinusculas = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)

// PostgreSQL no acepta el carácter nulo en un texto (la consulta fallaría con un 500): `@SinCaracterNulo` lo rechaza.
const MENSAJE_CARACTERES = 'tiene caracteres no válidos'

/** Alta de una marca: nombre e identificador. El logo no (lo carga el dueño). */
export class CrearMarcaRootDto {
  @ApiProperty({ example: 'La Parrilla de Juan', maxLength: MAX_NOMBRE })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOMBRE)
  @SinCaracterNulo({ message: `nombre ${MENSAJE_CARACTERES}` })
  nombre!: string

  @ApiProperty({
    example: 'la-parrilla-de-juan',
    maxLength: MAX_SLUG,
    description: 'Identificador interno: minúsculas, números y guiones. Es único, incluso entre las marcas dadas de baja.',
  })
  @Transform(recortarEnMinusculas)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SLUG)
  @Matches(FORMA_SLUG, { message: 'slug solo admite minúsculas, números y guiones sueltos (por ejemplo la-parrilla-de-juan)' })
  slug!: string
}

export class EditarMarcaRootDto {
  @ApiPropertyOptional({ example: 'La Parrilla', maxLength: MAX_NOMBRE })
  @Transform(recortar)
  // Se valida siempre que venga en el body: con @IsOptional() un null pasaría.
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOMBRE)
  @SinCaracterNulo({ message: `nombre ${MENSAJE_CARACTERES}` })
  nombre?: string

  @ApiPropertyOptional({ example: 'la-parrilla', maxLength: MAX_SLUG })
  @Transform(recortarEnMinusculas)
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SLUG)
  @Matches(FORMA_SLUG, { message: 'slug solo admite minúsculas, números y guiones sueltos (por ejemplo la-parrilla-de-juan)' })
  slug?: string
}

export class ListarMarcasDto {
  @ApiPropertyOptional({ description: 'true: incluye las marcas dadas de baja. Por defecto solo las activas.', default: false })
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' || value === '' ? false : value))
  @IsOptional()
  @IsBoolean()
  bajas?: boolean
}

/** Alta de un restaurante dentro de una marca. La dirección la carga ROOT esta única vez: después la cambia solo el dueño. */
export class CrearRestauranteRootDto {
  @ApiProperty({ example: 'La Parrilla Centro', maxLength: MAX_NOMBRE })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOMBRE)
  @SinCaracterNulo({ message: `nombre ${MENSAJE_CARACTERES}` })
  nombre!: string

  @ApiProperty({ example: 'Av. Colón 1200, Córdoba', maxLength: MAX_DIRECCION })
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DIRECCION)
  @SinCaracterNulo({ message: `direccion ${MENSAJE_CARACTERES}` })
  direccion!: string
}

/** ROOT solo cambia el nombre de un restaurante. */
export class EditarRestauranteRootDto {
  @ApiPropertyOptional({ example: 'La Parrilla Centro', maxLength: MAX_NOMBRE })
  @Transform(recortar)
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOMBRE)
  @SinCaracterNulo({ message: `nombre ${MENSAJE_CARACTERES}` })
  nombre?: string
}
