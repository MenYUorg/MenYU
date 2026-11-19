import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator'
import { MAX_MONTO } from '../../caja/dto/abrir-turno.dto'

export class ConfirmarEfectivoDto {
  @ApiProperty({ example: 'uuid-del-pago' })
  @IsUUID()
  pagoId!: string

  /** Solo lo tiene en cuenta un OWNER o un GERENTE: un mozo cobra a su propio nombre. */
  @ApiPropertyOptional({ example: 'uuid-del-mozo' })
  @IsOptional()
  @IsString()
  mozoId?: string

  /** La caja abierta del turno a la que va el cobro (#358): sin ella, la única abierta; con dos, es obligatoria. */
  @ApiPropertyOptional({ example: '6f1c2a40-5555-4a1b-9c3d-000000000001', nullable: true, description: 'null cuenta como ausente' })
  @IsOptional()
  @IsUUID()
  cajaId?: string | null

  /** Aparte del monto: no cambia el total de la sesión (#358). */
  @ApiPropertyOptional({ example: 500, minimum: 0, maximum: MAX_MONTO, nullable: true, description: 'Hasta 2 decimales; null cuenta como 0' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONTO)
  propina?: number | null
}
