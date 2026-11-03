import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayNotEmpty, IsArray, IsIn, IsString, ValidateNested } from 'class-validator'
import { SinCaracterNulo } from '../../common/sin-caracter-nulo'

// El historial que guarda web-cliente (docs/asistente/specs/asistente.md, "Endpoint del asistente y streaming"). Acá solo
// se valida la forma: el largo de la pregunta (400 pregunta_larga) y el truncado del historial los hace AsistenteService,
// después de validar el restaurante, que va primero. Misma forma que `PeticionAlAsistente` de `@menyu/types`.

const ROLES = ['usuario', 'asistente'] as const

export class MensajeDelChatDto {
  @ApiProperty({ enum: ROLES, example: 'usuario' })
  @IsIn(ROLES)
  rol!: (typeof ROLES)[number]

  @ApiProperty({ example: '¿La provoleta pica?' })
  @IsString()
  @SinCaracterNulo()
  contenido!: string
}

export class MensajesDelAsistenteDto {
  @ApiProperty({
    type: [MensajeDelChatDto],
    description:
      'La conversación, del más viejo al más nuevo. El último es la pregunta (del usuario); el backend usa solo los últimos ASISTENTE_MAX_MENSAJES_HISTORIAL',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MensajeDelChatDto)
  mensajes!: MensajeDelChatDto[]
}
