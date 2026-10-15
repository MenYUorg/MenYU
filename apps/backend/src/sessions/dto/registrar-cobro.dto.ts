import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator'

const METODOS_PAGO_STAFF = ['efectivo', 'debito', 'credito', 'transferencia', 'mercadopago'] as const

export class RegistrarCobroDto {
  @IsIn(METODOS_PAGO_STAFF)
  metodoPago!: (typeof METODOS_PAGO_STAFF)[number]

  @IsOptional()
  @IsString()
  mozoId?: string

  @IsOptional()
  @IsString()
  cobradoPorNombre?: string

  @IsOptional()
  @IsString()
  referenciaExterna?: string

  // Confirmación explícita de que se cancelan los pagos pendientes de
  // comensales individuales al cobrar la mesa completa (Tarea 3).
  @IsOptional()
  @IsBoolean()
  confirmarCancelacionPagosPendientes?: boolean
}
