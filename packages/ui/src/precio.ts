// Cómo leen las apps el precio de un plato. El backend manda el descuento ya calculado
// (`precioDescuento`, `porcentajeDescuento` y `precioVigente`): acá solo se leen, nunca se calculan.

/** Datos de precio de un plato, tal como los devuelve la API. */
export interface PrecioDePlato {
  precioBase: number
  /** Precio con descuento en pesos enteros, o null/ausente si el plato no está en descuento. */
  precioDescuento?: number | null
  /** Porcentaje entero de 1 a 99, o null/ausente si el plato no está en descuento. */
  porcentajeDescuento?: number | null
  /** Lo que se cobra por el plato sin extras. Ausente si el backend todavía no manda descuentos. */
  precioVigente?: number
}

/**
 * Lo que se cobra por el plato sin extras: el precio con descuento si lo tiene, si no el precio base.
 * Si la respuesta no trae `precioVigente` (backend sin actualizar), se usa el precio base.
 */
export function precioVigenteDe(item: Pick<PrecioDePlato, 'precioBase' | 'precioVigente'>): number {
  return item.precioVigente ?? Number(item.precioBase)
}

/** true si el plato está en descuento (el backend manda el precio y el porcentaje ya calculados). */
export function tieneDescuento(
  item: Pick<PrecioDePlato, 'precioDescuento' | 'porcentajeDescuento'>,
): item is { precioDescuento: number; porcentajeDescuento: number } {
  return item.precioDescuento != null && item.porcentajeDescuento != null
}
