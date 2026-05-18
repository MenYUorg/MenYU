import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator'

export class UpdateMozoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nombre?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefono?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  activo?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  esJefeSalon?: boolean

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string
}
