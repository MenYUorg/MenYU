import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
} from 'class-validator'

export class CreateItemDto {
  @IsUUID()
  marcaId!: string

  @IsString()
  @IsNotEmpty()
  nombre!: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioBase!: number

  @IsOptional()
  @IsString()
  descripcion?: string

  @IsOptional()
  @IsUUID()
  subcategoriaId?: string

  @IsOptional()
  @IsUUID()
  comandaId?: string

  @IsOptional()
  @IsBoolean()
  disponible?: boolean

  @IsOptional()
  @IsUrl()
  imagenUrl?: string
}
