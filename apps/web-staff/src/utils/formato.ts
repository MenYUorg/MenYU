/** Un monto en pesos para mostrar: `$` y el número en es-AR, con hasta 2 decimales (sin ceros de relleno). */
export function formatearMonto(valor: number): string {
  return '$' + valor.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

const dosCifras = (n: number) => String(n).padStart(2, '0')

/** Una fecha y hora en la zona del navegador, como `dd/mm hh:mm` (sin el año: un turno dura horas). */
export function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso)
  return `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
}
