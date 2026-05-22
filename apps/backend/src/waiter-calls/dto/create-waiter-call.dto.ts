import { IsUUID } from 'class-validator'

export class CreateWaiterCallDto {
  @IsUUID()
  sesionId!: string
}
