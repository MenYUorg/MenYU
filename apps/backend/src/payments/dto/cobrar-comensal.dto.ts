import { IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator'

const METODOS_PAGO_STAFF = ['efectivo', 'debito', 'credito', 'transferencia', 'mercadopago'] as const

export class CobrarComensalDto {
  // null cuando es un slot virtual (Invitado N) que se va a materializar.
  @ValidateIf((o) => o.comensalId !== null)
  @IsString()
  comensalId!: string | null

  // Obligatorio solo cuando comensalId es null: el "N" de "Invitado N" tal
  // como lo mostró GET /payments/sesiones/:sesionId/comensales.
  @ValidateIf((o) => o.comensalId === null)
  @IsInt()
  @Min(1)
  indiceSlot?: number

  @IsIn(METODOS_PAGO_STAFF)
  metodoPago!: (typeof METODOS_PAGO_STAFF)[number]

  @IsOptional()
  @IsString()
  mozoId?: string

  // Quién responde por el cobro cuando no es un mozo con cuenta (gerente, o
  // "Mercado Pago"). Mismo criterio que RegistrarCobroDto. No hay
  // referenciaExterna: en el cobro individual por MP ese dato viene del webhook.
  @IsOptional()
  @IsString()
  cobradoPorNombre?: string
}
