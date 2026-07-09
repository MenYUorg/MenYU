import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class CreateRestauranteDto {
  @IsUUID()
  marcaId!: string

  @IsString()
  @IsNotEmpty()
  nombre!: string

  @IsString()
  @IsOptional()
  direccion?: string

}
