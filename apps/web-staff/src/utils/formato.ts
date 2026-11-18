/**
 * Un monto en pesos para mostrar: `$` y el número en es-AR, sin decimales si es entero y con 2 si tiene centavos
 * ($5.000, $1.500,50). Se decide sobre el monto redondeado a centavos: 4,999 se muestra $5.
 */
export function formatearMonto(valor: number): string {
  const decimales = Math.round(valor * 100) % 100 === 0 ? 0 : 2
  return '$' + valor.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

const dosCifras = (n: number) => String(n).padStart(2, '0')

/** Una fecha y hora en la zona del navegador, como `dd/mm hh:mm` (sin el año: un turno dura horas). */
export function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso)
  return `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
}
