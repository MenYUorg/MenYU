import { IsBoolean, IsNumber, IsOptional, IsPositive } from 'class-validator'

export class UpdateIngredienteItemDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  cantidad?: number

  @IsOptional()
  @IsBoolean()
  removible?: boolean

  @IsOptional()
  @IsBoolean()
  esOriginal?: boolean
}
