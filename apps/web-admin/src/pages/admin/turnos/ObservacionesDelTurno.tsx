/** Las observaciones del turno, con sus saltos de línea; nada si no hay. En la lista y en el detalle. */
export function ObservacionesDelTurno({ observaciones }: { observaciones: string | null }) {
  if (!observaciones) return null
  return (
    <p className="text-sm text-gray-700 whitespace-pre-line">
      <span className="font-medium">Observaciones:</span> {observaciones}
    </p>
  )
}
