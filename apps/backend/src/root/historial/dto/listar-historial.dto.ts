import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import { SinCaracterNulo } from '../../comun/sin-caracter-nulo'

export const ENTIDADES_FILTRABLES = ['MARCA', 'RESTAURANTE', 'OWNER', 'ROOT'] as const
export const POR_PAGINA = 50

// Un parámetro vacío (`?actor=`) es "sin filtro": las pantallas mandan los campos aunque estén en blanco.
const vacioEsNada = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value
  const recortado = value.trim()
  return recortado === '' ? undefined : recortado
}

export class ListarHistorialDto {
  @ApiPropertyOptional({
    example: 'ana@ejemplo.com',
    description: 'Quién lo hizo: el email de una cuenta ROOT (sin distinguir mayúsculas) o `script` para las acciones del script de cuentas ROOT.',
  })
  @Transform(vacioEsNada)
  @IsOptional()
  @IsString()
  @MaxLength(254)
  // PostgreSQL no acepta el carácter nulo en un texto: la consulta fallaría con un 500.
  @SinCaracterNulo({ message: 'actor tiene caracteres no válidos' })
  actor?: string

  @ApiPropertyOptional({ enum: ENTIDADES_FILTRABLES, description: 'Sobre qué: marcas, restaurantes, dueños (OWNER) o cuentas ROOT.' })
  @Transform(vacioEsNada)
  @IsOptional()
  @IsIn(ENTIDADES_FILTRABLES)
  entidad?: (typeof ENTIDADES_FILTRABLES)[number]

  @ApiPropertyOptional({ example: '2026-10-15', description: 'Desde el principio de ese día, hora de Buenos Aires (YYYY-MM-DD).' })
  @Transform(vacioEsNada)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde tiene que ser una fecha YYYY-MM-DD' })
  desde?: string

  @ApiPropertyOptional({ example: '2026-10-20', description: 'Hasta el final de ese día, hora de Buenos Aires (YYYY-MM-DD).' })
  @Transform(vacioEsNada)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta tiene que ser una fecha YYYY-MM-DD' })
  hasta?: string

  @ApiPropertyOptional({ example: 120, description: `Para pedir las ${POR_PAGINA} siguientes: el \`siguiente\` de la respuesta anterior.` })
  // Se lee el valor CRUDO (`obj[key]`): con @Type(() => Number) un `cursor=` vacío llegaría como 0 antes de que se lo pueda descartar.
  // Solo dígitos: cualquier otra cosa queda NaN y la validación responde 400.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const crudo = obj[key]
    if (typeof crudo !== 'string') return crudo
    const texto = crudo.trim()
    if (texto === '') return undefined
    return /^\d+$/.test(texto) ? Number(texto) : Number.NaN
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cursor?: number
}
