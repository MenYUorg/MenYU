import { IsString, Matches } from 'class-validator'

export class CambiarPinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'El PIN debe tener exactamente 4 dígitos numéricos' })
  pin!: string
}
