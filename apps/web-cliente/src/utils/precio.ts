// El precio vigente y la regla "¿está en descuento?" son iguales en todas las apps: viven en @menyu/ui.
export { precioVigenteDe, tieneDescuento } from '@menyu/ui'

// Formato argentino: punto para los miles, coma para los centavos y un espacio no separable (U+00A0) entre el "$" y el
// número. Los formateadores se crean una vez: construir un `Intl.NumberFormat` es caro y esto corre en cada render.
const opciones = { style: 'currency', currency: 'ARS' } as const
const SIN_CENTAVOS = new Intl.NumberFormat('es-AR', { ...opciones, minimumFractionDigits: 0, maximumFractionDigits: 0 })
const CON_CENTAVOS = new Intl.NumberFormat('es-AR', { ...opciones, minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Cómo escribe web-cliente un precio: "$ 9.000" si es un número entero y "$ 1.234,50" si tiene centavos. No se puede
 * cortar siempre en 0 decimales: los precios son `Decimal(10,2)` y la división de la cuenta genera centavos, así que
 * $1.234,50 se mostraría como $1.235. Se redondea a centavos antes de decidir, para que el ruido de la coma flotante
 * (3000.0000000004) no la convierta en "$ 3.000,00".
 */
export const formatearPrecio = (valor: number): string => {
  const centavos = Math.round(valor * 100)
  // `0` y no `-0`: sin esto, -0.001 se escribiría "-$ 0".
  const monto = centavos === 0 ? 0 : centavos / 100
  return centavos % 100 === 0 ? SIN_CENTAVOS.format(monto) : CON_CENTAVOS.format(monto)
}
