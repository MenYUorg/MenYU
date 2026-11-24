import { formatearMonto } from '@menyu/ui/caja'
import { C } from '../marca/estilos'

/** "Barra · Fondo inicial $5.000": la primera línea de una caja del turno, en la lista y en el detalle. */
export function NombreYFondo({ nombre, fondoInicial }: { nombre: string; fondoInicial: number }) {
  return (
    <p>
      <span style={{ fontWeight: 600, color: C.text }}>{nombre}</span> · Fondo inicial {formatearMonto(fondoInicial)}
    </p>
  )
}
