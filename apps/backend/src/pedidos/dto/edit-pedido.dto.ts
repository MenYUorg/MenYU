import { Type } from 'class-transformer'
import { IsArray, IsInt, IsNotEmpty, IsString, IsUUID, ArrayNotEmpty, Min, ValidateNested } from 'class-validator'

class EdicionItemDto {
  @IsUUID()
  pedidoItemId!: string

  @IsInt()
  @Min(0)
  cantidadNueva!: number
}

export class EditPedidoDto {
  @IsString()
  @IsNotEmpty()
  justificacion!: string

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => EdicionItemDto)
  ediciones!: EdicionItemDto[]
}
