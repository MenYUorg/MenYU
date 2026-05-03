import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'MiPassword123!' })
  @IsString()
  password!: string
}
