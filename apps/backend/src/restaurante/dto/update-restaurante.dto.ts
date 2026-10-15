import { Transform } from 'class-transformer'
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator'

export class UpdateRestauranteDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nombre?: string

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  // Se valida siempre que venga en el body: con @IsOptional() un null pasaría y dejaría al restaurante sin dirección.
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccion?: string

  @IsIn(['abierto', 'seguro'])
  @IsOptional()
  modoSesion?: string

  @IsString()
  @IsOptional()
  @MaxLength(60)
  nombreSeccionRecomendados?: string
}
