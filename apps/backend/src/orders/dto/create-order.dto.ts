import { IsString, IsNumber, IsArray, ValidateNested, IsIn, IsOptional, Min } from 'class-validator'
import { Type } from 'class-transformer'

export class CreateModDto {
  @IsString()
  itemIngredienteId!: string

  @IsIn(['agregar', 'quitar'])
  accion!: 'agregar' | 'quitar'

  @IsNumber()
  @Min(0)
  cantidad!: number
}

export class CreateItemPedidoDto {
  @IsString()
  itemMenuId!: string

  @IsNumber()
  @Min(1)
  cantidad!: number

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateModDto)
  modificaciones!: CreateModDto[]

  @IsOptional()
  @IsString()
  nota?: string
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateItemPedidoDto)
  items!: CreateItemPedidoDto[]
}
