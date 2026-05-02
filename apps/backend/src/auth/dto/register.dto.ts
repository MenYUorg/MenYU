import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ example: 'Juan Pérez' })
  nombre: string

  @ApiProperty({ example: 'juan@example.com' })
  email: string

  @ApiProperty({ example: 'MiPassword123!' })
  password: string

  @ApiPropertyOptional({ example: '+5491112345678' })
  telefono?: string
}
