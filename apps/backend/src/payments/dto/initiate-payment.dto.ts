import { IsNumber, IsString, Min } from 'class-validator'

export class InitiatePaymentDto {
  @IsString()
  pedidoId!: string

  @IsString()
  restauranteId!: string

  @IsString()
  sesionId!: string

  @IsNumber()
  @Min(0)
  monto!: number

  @IsString()
  descripcion!: string
}
