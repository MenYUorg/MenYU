import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator'

export class CreateCategoriaDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @IsUUID()
  restauranteId!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number
}
