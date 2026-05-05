import { IsOptional, IsString } from 'class-validator'

export class OpenSessionDto {
  @IsOptional()
  @IsString()
  tableCode?: string

  @IsOptional()
  @IsString()
  restaurantId?: string

  @IsOptional()
  @IsString()
  pin?: string

  @IsOptional()
  @IsString()
  codigoSesion?: string
}
