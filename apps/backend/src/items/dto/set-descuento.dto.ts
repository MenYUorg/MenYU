import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

// Se manda exactamente uno de los dos: el servicio calcula el otro. El resto de las reglas (precio menor
// al base, redondeo, porcentaje resultante) dependen del precio base del ítem y se validan en descuento.util.
export class SetDescuentoDto {
  @ApiPropertyOptional({
    example: 1200,
    description: 'Precio con descuento, en pesos enteros. Se manda este o el porcentaje, no los dos.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  precioDescuento?: number

  @ApiPropertyOptional({
    example: 20,
    description: 'Porcentaje de descuento, entero de 1 a 99. Se manda este o el precio, no los dos.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  porcentaje?: number
}
