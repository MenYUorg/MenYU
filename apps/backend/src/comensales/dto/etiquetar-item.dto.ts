import { IsUUID } from 'class-validator'

export class EtiquetarItemDto {
  @IsUUID('all')
  pedidoItemId!: string

  @IsUUID('all')
  comensalId!: string
}
