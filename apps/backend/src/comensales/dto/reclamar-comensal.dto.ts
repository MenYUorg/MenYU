import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class ReclamarComensalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombre!: string

  @IsString()
  @MaxLength(20)
  pin!: string
}
