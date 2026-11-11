import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'

export const LIMITE_POR_DEFECTO = 30
export const LIMITE_MAXIMO = 100

/** El historial de turnos de un restaurante, del más nuevo al más viejo, de a `limite`. */
export class ListarTurnosDto {
  @ApiProperty({ example: '6f1c2a40-5555-4a1b-9c3d-000000000001' })
  @IsString()
  @IsNotEmpty()
  restauranteId!: string

  @ApiPropertyOptional({ example: LIMITE_POR_DEFECTO, minimum: 1, maximum: LIMITE_MAXIMO, description: `Cuántos turnos por página (${LIMITE_POR_DEFECTO} si no viene)` })
  // Como el `cursor` del historial de ROOT: se lee el valor CRUDO, porque con @Type(() => Number) un `limite=` vacío
  // llegaría como 0. Solo dígitos: cualquier otra cosa ("abc", "2.5", "-1") queda NaN y la validación responde 400.
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
  @Max(LIMITE_MAXIMO)
  limite?: number

  @ApiPropertyOptional({ example: '6f1c2a40-5555-4a1b-9c3d-000000000002', description: 'Para pedir la página siguiente: el `siguiente` de la respuesta anterior' })
  @IsOptional()
  @IsUUID()
  cursor?: string
}
