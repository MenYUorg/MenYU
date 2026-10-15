import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

export class CrearComensalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombre!: string

  @IsOptional()
  @IsBoolean()
  esOwner?: boolean

  @IsOptional()
  @IsUUID('all')
  creadoPorComensalId?: string
}
