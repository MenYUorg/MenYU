import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsUUID } from 'class-validator'

export class ConfirmarEfectivoDto {
  @ApiProperty({ example: 'uuid-del-pago' })
  @IsUUID()
  pagoId!: string

  /** Solo lo tiene en cuenta un OWNER o un GERENTE: un mozo cobra a su propio nombre. */
  @ApiPropertyOptional({ example: 'uuid-del-mozo' })
  @IsOptional()
  @IsString()
  mozoId?: string
}
