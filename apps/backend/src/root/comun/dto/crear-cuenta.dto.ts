import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator'
import { MIN_LARGO_PASSWORD } from '../contrasenas'

/** El email se recorta y se pasa a minúsculas antes de validarlo: el login lo busca así. */
export const enMinusculas = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)

/** Alta de una cuenta (dueño o ROOT): el email y, opcionalmente, una contraseña elegida. Sin `nombre`: una cuenta es email + contraseña. */
export class CrearCuentaDto {
  @ApiProperty({ example: 'juan@restaurante.com' })
  @Transform(enMinusculas)
  @IsEmail()
  @MaxLength(254)
  email!: string

  @ApiPropertyOptional({
    minLength: MIN_LARGO_PASSWORD,
    description:
      'Si no viene, el sistema genera una contraseña temporal y la devuelve una sola vez. Si viene, tiene que tener al menos 12 caracteres. En los dos casos la persona tiene que cambiarla en su primer ingreso.',
  })
  @IsOptional()
  @IsString()
  password?: string
}

export class CambiarEmailDto {
  @ApiProperty({ example: 'nuevo@restaurante.com' })
  @Transform(enMinusculas)
  @IsEmail()
  @MaxLength(254)
  email!: string
}
