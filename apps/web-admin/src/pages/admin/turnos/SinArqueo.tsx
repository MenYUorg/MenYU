import { C } from '../marca/estilos'

/** Una caja de un turno cerrado sin arqueo (no debería pasar): se dice, sin romper. En la lista y en el detalle. */
export function SinArqueo() {
  return <p style={{ color: C.sub, margin: 0 }}>No hay arqueo de esta caja</p>
}
