import { IsString, IsIn } from 'class-validator'

export class UpdateEstadoPedidoDto {
  @IsString()
  @IsIn(['en_preparacion', 'listo', 'entregado'])
  estado!: string
}
