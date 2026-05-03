import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

export class UpdateCategoriaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number
}
