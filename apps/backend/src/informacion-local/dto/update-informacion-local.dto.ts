import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator'
import { TextoOpcional } from '../../common/texto-libre'

// Van al prompt del asistente en cada pregunta: el tope también acota el contexto.
const MAX_HORARIOS = 500
const MAX_FORMAS_PAGO = 200

const SERVICIO = {
  nullable: true,
  example: true,
  description: 'true o false si el local lo declaró; null = sin dato (el asistente dice que no lo tiene).',
}

/**
 * `PUT /restaurantes/:restauranteId/informacion-local` es un upsert parcial: lo que no viene no cambia (en el alta,
 * queda sin dato y el asistente apagado) y null lo borra. Los servicios son tri-estado a propósito.
 */
export class UpdateInformacionLocalDto {
  @ApiPropertyOptional({ example: true, description: 'Prende o apaga el asistente en la carta del restaurante. No admite null.' })
  // Se valida siempre que venga en el body: con @IsOptional() pasaría un null, y la columna no lo admite.
  @ValidateIf((_dto, valor: unknown) => valor !== undefined)
  @IsBoolean()
  asistenteHabilitado?: boolean

  @ApiPropertyOptional({ nullable: true, example: 'Martes a domingo de 12 a 16 y de 20 a 24', maxLength: MAX_HORARIOS })
  @TextoOpcional(MAX_HORARIOS)
  horarios?: string | null

  @ApiPropertyOptional({ nullable: true, example: 'Efectivo, débito, crédito y Mercado Pago', maxLength: MAX_FORMAS_PAGO })
  @TextoOpcional(MAX_FORMAS_PAGO)
  formasPago?: string | null

  @ApiPropertyOptional(SERVICIO)
  @IsOptional()
  @IsBoolean()
  wifi?: boolean | null

  @ApiPropertyOptional(SERVICIO)
  @IsOptional()
  @IsBoolean()
  petFriendly?: boolean | null

  @ApiPropertyOptional(SERVICIO)
  @IsOptional()
  @IsBoolean()
  accesibleSillaRuedas?: boolean | null

  @ApiPropertyOptional(SERVICIO)
  @IsOptional()
  @IsBoolean()
  opcionesParaChicos?: boolean | null

  @ApiPropertyOptional(SERVICIO)
  @IsOptional()
  @IsBoolean()
  estacionamiento?: boolean | null
}
