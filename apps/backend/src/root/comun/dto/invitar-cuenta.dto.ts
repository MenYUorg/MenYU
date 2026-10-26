import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { SinCaracterNulo } from '../../../common/sin-caracter-nulo'

/** El email se recorta y se pasa a minúsculas antes de validarlo: Supabase y `Usuario` lo guardan así. */
export const enMinusculas = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)

const recortado = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

/**
 * A quién invita ROOT: un dueño o una cuenta ROOT. La contraseña no pasa por acá: la persona la elige desde el mail de la
 * invitación (o entra con Google).
 */
export class InvitarCuentaDto {
  @ApiProperty({ example: 'juan@restaurante.com' })
  @Transform(enMinusculas)
  @IsEmail()
  @MaxLength(254)
  email!: string

  @ApiProperty({ example: 'Juan Pérez', description: 'Cómo se la ve en el panel. Si el email ya tiene cuenta, se conserva el nombre que tenía.' })
  @Transform(recortado)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @SinCaracterNulo({ message: 'nombre tiene caracteres no válidos' })
  nombre!: string
}
