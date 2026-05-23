import { ApiPropertyOptional } from '@nestjs/swagger'
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

export class UpdateItemDto {
  @ApiPropertyOptional({ example: 'Milanesa napolitana' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string

  @ApiPropertyOptional({ example: 1600.00 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioBase?: number

  @ApiPropertyOptional({ example: 'Descripción actualizada' })
  @IsOptional()
  @IsString()
  descripcion?: string

  @ApiPropertyOptional({ example: 'uuid-de-la-categoria' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string | null

  @ApiPropertyOptional({ example: 'uuid-de-la-comanda' })
  @IsOptional()
  @IsUUID()
  comandaId?: string

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  disponible?: boolean

  @ApiPropertyOptional({ example: 'https://storage.example.com/nueva-imagen.jpg' })
  @IsOptional()
  @IsUrl()
  imagenUrl?: string
}
