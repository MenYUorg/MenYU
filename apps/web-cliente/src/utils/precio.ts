// El precio vigente y la regla "¿está en descuento?" son iguales en todas las apps: viven en @menyu/ui.
export { precioVigenteDe, tieneDescuento } from '@menyu/ui'

/** Cómo escribe web-cliente un precio: "$1500.00". */
export const formatearPrecio = (valor: number): string => `$${valor.toFixed(2)}`
