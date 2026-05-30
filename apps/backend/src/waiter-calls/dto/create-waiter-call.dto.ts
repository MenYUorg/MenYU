import { IsOptional, IsString, IsUUID } from 'class-validator'

export class CreateWaiterCallDto {
  @IsUUID()
  sesionId!: string

  @IsOptional()
  @IsString()
  motivo?: string
}
