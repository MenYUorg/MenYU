import { IsNotEmpty, IsString, IsUUID } from 'class-validator'

export class CreateIngredienteDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @IsUUID()
  restauranteId!: string
}
