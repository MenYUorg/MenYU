import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator'

export class UpdateAdminDto {
  @ApiPropertyOptional({ example: 'nuevo@restaurante.com' })
  @IsOptional()
  @IsEmail()
  email?: string

  @ApiPropertyOptional({ example: 'NewPassword123!', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string
}
