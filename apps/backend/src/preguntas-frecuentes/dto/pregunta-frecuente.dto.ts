import { ApiProperty } from '@nestjs/swagger'
import { TextoObligatorio } from '../../common/texto-libre'

// Van al prompt del asistente en cada pregunta: el tope también acota el contexto.
const MAX_PREGUNTA = 200
const MAX_RESPUESTA = 1000

/** Alta (`POST`) y edición (`PUT`) de una pregunta frecuente: van las dos partes. */
export class PreguntaFrecuenteDto {
  @ApiProperty({ example: '¿Hacen reservas?', maxLength: MAX_PREGUNTA })
  @TextoObligatorio(MAX_PREGUNTA)
  pregunta!: string

  @ApiProperty({ example: 'Sí, por teléfono o por WhatsApp, hasta las 18 del mismo día.', maxLength: MAX_RESPUESTA })
  @TextoObligatorio(MAX_RESPUESTA)
  respuesta!: string
}
