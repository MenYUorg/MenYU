import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator'

export class CreateMesaDto {
  @IsString()
  @IsNotEmpty()
  numero!: string

  @IsUUID()
  restauranteId!: string

  @IsOptional()
  @IsIn(['libre', 'ocupada', 'reservada'])
  estado?: string
}
