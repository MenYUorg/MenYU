import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateMarcaDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nombre?: string

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  slug?: string
}
