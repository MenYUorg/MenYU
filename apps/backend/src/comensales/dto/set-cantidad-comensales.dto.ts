import { IsInt, Min, ValidateIf } from 'class-validator'

export class SetCantidadComensalesDto {
  @ValidateIf((o) => o.cantidadComensales !== null)
  @IsInt()
  @Min(1)
  cantidadComensales!: number | null
}
