import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator'

export class CreateSubcategoriaDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number
}
