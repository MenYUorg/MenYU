/** Un monto en pesos para mostrar: `$` y el número en es-AR, con hasta 2 decimales (sin ceros de relleno). */
export function formatearMonto(valor: number): string {
  return '$' + valor.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
