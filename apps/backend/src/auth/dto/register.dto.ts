import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator'

export class RegisterDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  nombre: string

  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'MiPassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string

  @ApiPropertyOptional({ example: '+5491112345678' })
  @IsOptional()
  @IsString()
  telefono?: string
}
