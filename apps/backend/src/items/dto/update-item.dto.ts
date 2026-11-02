import { ApiPropertyOptional } from '@nestjs/swagger'
import { EtiquetaDietaria, NivelPicante, TamanioPorcion, Temperatura } from '@prisma/client'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  Min,
} from 'class-validator'
import { TextoOpcional } from '../../common/texto-libre'

// Topes de los datos para el asistente: van al prompt en cada pregunta, así que también acotan el contexto.
const MAX_PORCION_PERSONAS = 100
const MAX_TIEMPO_PREPARACION_MIN = 600
const MAX_PORCION_DETALLE = 100
const MAX_ACOMPANAMIENTO = 200
const MAX_INFO_ADICIONAL = 500

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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  esRecomendado?: boolean

  @ApiPropertyOptional({ example: 'https://storage.example.com/nueva-imagen.jpg' })
  @IsOptional()
  @IsUrl()
  imagenUrl?: string

  // ── Datos para el asistente de mesa (docs/asistente/specs/asistente.md) ──
  // Todos opcionales: sin mandarlos no cambian y null los borra (el asistente dice que no tiene el dato).

  @ApiPropertyOptional({ enum: TamanioPorcion, nullable: true, example: TamanioPorcion.PARA_N_PERSONAS })
  @IsOptional()
  @IsEnum(TamanioPorcion)
  tamanioPorcion?: TamanioPorcion | null

  @ApiPropertyOptional({
    nullable: true,
    example: 2,
    minimum: 1,
    maximum: MAX_PORCION_PERSONAS,
    description: 'Para cuántas personas es. Solo con PARA_N_PERSONAS: con otro tamaño (o sin tamaño) se borra al guardar.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PORCION_PERSONAS)
  porcionPersonas?: number | null

  @ApiPropertyOptional({ nullable: true, example: '300 g', maxLength: MAX_PORCION_DETALLE })
  @TextoOpcional(MAX_PORCION_DETALLE)
  porcionDetalle?: string | null

  @ApiPropertyOptional({ enum: Temperatura, nullable: true, example: Temperatura.CALIENTE })
  @IsOptional()
  @IsEnum(Temperatura)
  temperatura?: Temperatura | null

  @ApiPropertyOptional({ enum: NivelPicante, nullable: true, example: NivelPicante.SUAVE })
  @IsOptional()
  @IsEnum(NivelPicante)
  nivelPicante?: NivelPicante | null

  @ApiPropertyOptional({ nullable: true, example: 'Papas fritas', maxLength: MAX_ACOMPANAMIENTO })
  @TextoOpcional(MAX_ACOMPANAMIENTO)
  acompanamiento?: string | null

  @ApiPropertyOptional({
    nullable: true,
    example: 15,
    minimum: 1,
    maximum: MAX_TIEMPO_PREPARACION_MIN,
    description: 'Tiempo de preparación estimado, en minutos.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_TIEMPO_PREPARACION_MIN)
  tiempoPreparacionMin?: number | null

  @ApiPropertyOptional({
    enum: EtiquetaDietaria,
    isArray: true,
    nullable: true,
    example: [EtiquetaDietaria.VEGETARIANO, EtiquetaDietaria.SIN_TACC],
    description: 'Reemplaza las etiquetas del plato. [] o null = sin etiquetas declaradas.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(EtiquetaDietaria, { each: true })
  etiquetasDietarias?: EtiquetaDietaria[] | null

  @ApiPropertyOptional({ nullable: true, example: 'Se puede pedir sin cebolla', maxLength: MAX_INFO_ADICIONAL })
  @TextoOpcional(MAX_INFO_ADICIONAL)
  infoAdicional?: string | null
}
