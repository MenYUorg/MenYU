import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { SinCaracterNulo } from '../../common/sin-caracter-nulo'
import { MAX_NOMBRE, MAX_SLUG } from '../../root/marcas/dto/marca-root.dto'

// Los mismos topes que la consola de ROOT: el nombre y el identificador van al historial de ROOT cuando ROOT actúa sobre la marca.
export class UpdateMarcaDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(MAX_NOMBRE)
  @SinCaracterNulo({ message: 'nombre tiene caracteres no válidos' })
  nombre?: string

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(MAX_SLUG)
  @SinCaracterNulo({ message: 'slug tiene caracteres no válidos' })
  slug?: string
}
