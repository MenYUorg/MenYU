import {
  IsUUID,
  IsString,
  IsIn,
  IsNumber,
  IsInt,
  IsArray,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreatePedidoItemModDto {
  @IsUUID('all')
  itemIngredienteId!: string

  @IsString()
  @IsIn(['AGREGAR', 'QUITAR'])
  accion!: string

  @IsNumber()
  @Min(0.001)
  cantidad!: number
}

export class CreatePedidoItemDto {
  @IsUUID('all')
  itemId!: string

  @IsInt()
  @Min(1)
  cantidad!: number

  @IsOptional()
  @IsString()
  notas?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoItemModDto)
  mods?: CreatePedidoItemModDto[]
}

export class CreatePedidoDto {
  @IsUUID('all')
  sesionId!: string

  @IsUUID('all')
  mesaId!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePedidoItemDto)
  items!: CreatePedidoItemDto[]
}
