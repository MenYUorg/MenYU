import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'

export class GuestDto {
  @ApiPropertyOptional({ example: 'Invitado' })
  @IsOptional()
  @IsString()
  nombre?: string
}
