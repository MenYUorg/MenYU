import { IsUUID } from 'class-validator'

export class OpenStaffSessionDto {
  @IsUUID('all')
  mesaId!: string
}
