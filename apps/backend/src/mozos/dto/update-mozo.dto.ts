import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

/**
 * El email y la contraseña son de la cuenta de Supabase, si es jefe de salón lo dice su membresía y el acceso se
 * quita desde Personal: acá solo los datos del perfil.
 */
export class UpdateMozoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefono?: string
}
