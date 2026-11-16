import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'
import { MAX_MONTO } from '../../caja/dto/abrir-turno.dto'

export const METODOS_PAGO_STAFF = ['efectivo', 'debito', 'credito', 'transferencia', 'mercadopago'] as const

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

  // La caja abierta del turno a la que va el cobro (#358): sin ella, la única abierta; con dos, es obligatoria.
  // Un null cuenta como ausente.
  @IsOptional()
  @IsUUID()
  cajaId?: string | null

  // Aparte del monto: no cambia el total de la sesión (#358). Un null cuenta como 0.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONTO)
  propina?: number | null
}
