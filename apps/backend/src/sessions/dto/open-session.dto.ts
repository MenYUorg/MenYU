import { IsOptional, IsString } from 'class-validator'

export class OpenSessionDto {
  @IsOptional()
  @IsString()
  tableCode?: string

  @IsOptional()
  @IsString()
  restauranteId?: string

  @IsOptional()
  @IsString()
  pin?: string

  @IsOptional()
  @IsString()
  codigoSesion?: string
}
