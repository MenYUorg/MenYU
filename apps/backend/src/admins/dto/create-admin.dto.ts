import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator'

export class CreateAdminDto {
  @ApiProperty({ example: 'gerente@restaurante.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'NombreCompleto' })
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string
}
