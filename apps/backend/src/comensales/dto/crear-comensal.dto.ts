import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class CrearComensalDto {
  @IsString()
  nombre!: string

  @IsOptional()
  @IsBoolean()
  esOwner?: boolean
}
