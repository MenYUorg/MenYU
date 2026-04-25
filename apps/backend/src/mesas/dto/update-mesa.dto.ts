import { IsIn, IsOptional, IsString } from 'class-validator'

export class UpdateMesaDto {
  @IsOptional()
  @IsString()
  numero?: string

  @IsOptional()
  @IsIn(['libre', 'ocupada', 'reservada'])
  estado?: string
}
