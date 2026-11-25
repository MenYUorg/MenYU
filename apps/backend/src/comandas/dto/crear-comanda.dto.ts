import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { TextoObligatorio } from '../../common/texto-libre'

export const MAX_NOMBRE_COMANDA = 40

export class CrearComandaDto {
  @ApiProperty({ example: '6f1c2a40-1111-4a1b-9c3d-000000000001' })
  @IsUUID()
  restauranteId!: string

  @ApiProperty({ example: 'Cocina', maxLength: MAX_NOMBRE_COMANDA })
  @TextoObligatorio(MAX_NOMBRE_COMANDA)
  nombre!: string
}
