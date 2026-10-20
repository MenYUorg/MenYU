import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Rol } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class CrearInvitacionDto {
  // Supabase guarda el email en minúscula: así se compara igual con Usuario y Mozo.
  @ApiProperty({ example: 'carlos@restaurante.com' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'Carlos Gómez' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre!: string

  @ApiProperty({ enum: Rol, example: 'MOZO' })
  @IsEnum(Rol)
  rol!: Rol

  @ApiPropertyOptional({ description: 'Solo con rol OWNER' })
  @IsOptional()
  @IsUUID()
  marcaId?: string

  @ApiPropertyOptional({ description: 'Con cualquier rol salvo OWNER' })
  @IsOptional()
  @IsUUID()
  restauranteId?: string
}
