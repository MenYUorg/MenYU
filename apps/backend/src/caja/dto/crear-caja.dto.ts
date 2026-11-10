import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { TextoObligatorio } from '../../common/texto-libre'

export const MAX_NOMBRE_CAJA = 60

export class CrearCajaDto {
  @ApiProperty({ example: '6f1c2a40-1111-4a1b-9c3d-000000000001' })
  @IsUUID()
  restauranteId!: string

  @ApiProperty({ example: 'Caja principal', maxLength: MAX_NOMBRE_CAJA })
  @TextoObligatorio(MAX_NOMBRE_CAJA)
  nombre!: string
}
