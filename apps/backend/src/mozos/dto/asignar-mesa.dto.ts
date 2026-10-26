import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'

export class AsignarMesaDto {
  @ApiProperty({ example: 'uuid-de-la-mesa' })
  @IsUUID()
  mesaId!: string
}
