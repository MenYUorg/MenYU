import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, IsUUID } from 'class-validator'

export class CreateIngredienteDto {
  @ApiProperty({ example: 'Tomate' })
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @ApiProperty({ example: 'uuid-del-restaurante' })
  @IsUUID()
  restauranteId!: string
}
