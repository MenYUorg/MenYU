/**
 * Un monto en pesos para mostrar: `$` y el número en es-AR, sin decimales si es entero y con 2 si tiene centavos
 * ($5.000, $1.500,50). Un negativo lleva el signo antes del `$` (-$50). Se decide sobre el monto redondeado a centavos:
 * 4,999 se muestra $5 y -0,004, $0.
 */
export function formatearMonto(valor: number): string {
  const centavos = Math.round(valor * 100)
  const decimales = centavos % 100 === 0 ? 0 : 2
  const signo = centavos < 0 ? '-' : ''
  const numero = Math.abs(centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
  return `${signo}$${numero}`
}

const dosCifras = (n: number) => String(n).padStart(2, '0')

/** Una fecha y hora en la zona del navegador, como `dd/mm hh:mm` (sin el año: un turno dura horas). */
export function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso)
  return `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
}

/** Una fecha y hora en la zona del navegador, con el año: `dd/mm/aaaa hh:mm` (el historial de turnos cruza años). */
export function formatearFechaHoraCompleta(iso: string): string {
  const fecha = new Date(iso)
  return `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
}
