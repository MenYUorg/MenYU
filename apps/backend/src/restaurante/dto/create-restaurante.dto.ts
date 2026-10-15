import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'

export class CreateRestauranteDto {
  @IsUUID()
  marcaId!: string

  @IsString()
  @IsNotEmpty()
  nombre!: string

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  direccion!: string
}
