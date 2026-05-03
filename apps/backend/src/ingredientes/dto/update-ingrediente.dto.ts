import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateIngredienteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string
}
