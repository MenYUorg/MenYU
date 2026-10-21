/** El historial se agrupa por día y se muestra con la hora de Buenos Aires, igual que los filtros "Desde" y "Hasta" que usa la API. */
const ZONA = 'America/Argentina/Buenos_Aires'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })
const formatoHora = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false })

/** `2026-10-16T02:30:00Z` → `{ dia: '2026-10-15', hora: '23:30' }` (en Buenos Aires todavía es el 15). */
export function partesEnBuenosAires(iso: string): { dia: string; hora: string } {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return { dia: '', hora: '' }
  return { dia: formatoDia.format(fecha), hora: formatoHora.format(fecha) }
}

/** `2026-10-16` → `16 de octubre de 2026`. */
export function diaLargo(dia: string): string {
  const [anio, mes, d] = dia.split('-')
  const nombre = MESES[Number(mes) - 1]
  if (!anio || !nombre) return dia
  return `${Number(d)} de ${nombre} de ${anio}`
}
