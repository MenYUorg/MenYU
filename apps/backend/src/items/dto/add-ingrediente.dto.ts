import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator'

export class AddIngredienteDto {
  @ApiProperty({ example: 'uuid-del-ingrediente' })
  @IsUUID()
  ingredienteId!: string

  @ApiProperty({ example: true, description: 'Si el ingrediente es parte del plato original' })
  @IsBoolean()
  esOriginal!: boolean

  @ApiProperty({ example: 1.5, description: 'Cantidad en la unidad del ingrediente' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  cantidad!: number

  @ApiPropertyOptional({ example: true, description: 'Si el cliente puede quitar este ingrediente' })
  @IsOptional()
  @IsBoolean()
  removible?: boolean
}
