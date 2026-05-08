import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator'

export class CreateMozoDto {
  @ApiProperty({ example: 'uuid-del-restaurante' })
  @IsUUID()
  restauranteId!: string

  @ApiProperty({ example: 'Carlos Gómez' })
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @ApiPropertyOptional({ example: 'carlos@menyu.app' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string

  @ApiPropertyOptional({ example: '+54911111111' })
  @IsOptional()
  @IsString()
  telefono?: string

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  esJefeSalon?: boolean
}
