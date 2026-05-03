import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsEnum, IsString } from 'class-validator'
import { UserTipo } from '../auth.service'

export class LoginDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'MiPassword123!' })
  @IsString()
  password!: string

  @ApiProperty({ enum: ['admin', 'mozo', 'cliente'], example: 'cliente' })
  @IsEnum(['admin', 'mozo', 'cliente'])
  tipo!: UserTipo
}
