import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

export class UpdateSubcategoriaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number
}
