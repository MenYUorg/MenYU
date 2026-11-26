import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator'

export class UpdateEstadoPedidoDto {
  @IsString()
  @IsIn(['en_preparacion', 'listo', 'entregado'])
  estado!: string

  /** Solo con `estado: 'listo'`: marca listos los ítems de esa comanda (el pedido se cierra según la regla de `decidirListo`). Sin ella, el pedido entero. */
  @ValidateIf((dto: UpdateEstadoPedidoDto) => dto.comandaId !== undefined) // opcional, pero no null
  @IsString()
  @IsNotEmpty()
  comandaId?: string
}
