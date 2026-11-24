/** Las observaciones del turno, con sus saltos de línea; nada si no hay. En la lista y en el detalle. */
export function ObservacionesDelTurno({ observaciones }: { observaciones: string | null }) {
  if (!observaciones) return null
  return (
    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', margin: 0, whiteSpace: 'pre-line' }}>
      <span style={{ fontWeight: 600 }}>Observaciones:</span> {observaciones}
    </p>
  )
}
