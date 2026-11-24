import { textoCentrado } from '../cajas/estilos'

/** Una lectura en curso, con su nombre accesible (`etiqueta`), en la lista y en el detalle. */
export function Cargando({ etiqueta }: { etiqueta: string }) {
  return <p role="status" aria-label={etiqueta} style={textoCentrado}>Cargando…</p>
}
