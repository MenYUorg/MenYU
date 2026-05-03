import { IsBoolean, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator'

export class AddIngredienteDto {
  @IsUUID()
  ingredienteId!: string

  @IsBoolean()
  esOriginal!: boolean

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  cantidad!: number

  @IsOptional()
  @IsBoolean()
  removible?: boolean
}
