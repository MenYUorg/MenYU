import { formatearMonto } from '@menyu/ui/caja'

/** "Barra · Fondo inicial $5.000": la primera línea de una caja del turno, en la lista y en el detalle. */
export function NombreYFondo({ nombre, fondoInicial }: { nombre: string; fondoInicial: number }) {
  return (
    <p>
      <span className="font-medium text-gray-900">{nombre}</span> · Fondo inicial {formatearMonto(fondoInicial)}
    </p>
  )
}
