import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateRestauranteDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nombre?: string

  @IsString()
  @IsOptional()
  direccion?: string

  @IsIn(['abierto', 'seguro'])
  @IsOptional()
  modoSesion?: string

  @IsString()
  @IsOptional()
  @MaxLength(60)
  nombreSeccionRecomendados?: string
}
