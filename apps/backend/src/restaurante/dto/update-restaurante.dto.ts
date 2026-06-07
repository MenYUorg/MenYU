import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator'

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
}
