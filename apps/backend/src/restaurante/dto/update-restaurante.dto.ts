import { Transform } from 'class-transformer'
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator'
import { SinCaracterNulo } from '../../common/sin-caracter-nulo'
import { MAX_NOMBRE } from '../../root/marcas/dto/marca-root.dto'

export class UpdateRestauranteDto {
  // El mismo tope que la consola de ROOT: el nombre va al historial de ROOT cuando ROOT actúa sobre el restaurante.
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(MAX_NOMBRE)
  @SinCaracterNulo({ message: 'nombre tiene caracteres no válidos' })
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
