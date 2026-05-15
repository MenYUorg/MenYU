import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
} from 'class-validator'

export class CreateItemDto {
  @ApiProperty({ example: 'uuid-de-la-marca' })
  @IsUUID()
  marcaId!: string

  @ApiProperty({ example: 'Milanesa napolitana' })
  @IsString()
  @IsNotEmpty()
  nombre!: string

  @ApiProperty({ example: 1500.00 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioBase!: number

  @ApiPropertyOptional({ example: 'Milanesa de ternera con salsa napolitana y queso' })
  @IsOptional()
  @IsString()
  descripcion?: string

  @ApiPropertyOptional({ example: 'uuid-de-la-categoria' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string

  @ApiPropertyOptional({ example: 'uuid-de-la-subcategoria' })
  @IsOptional()
  @IsUUID()
  subcategoriaId?: string

  @ApiPropertyOptional({ example: 'uuid-de-la-comanda' })
  @IsOptional()
  @IsUUID()
  comandaId?: string

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  disponible?: boolean

  @ApiPropertyOptional({ example: 'https://storage.example.com/imagen.jpg' })
  @IsOptional()
  @IsUrl()
  imagenUrl?: string
}
