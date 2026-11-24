import { useId, type ReactNode } from 'react'
import { tituloSeccion } from '../marca/estilos'

/** Una sección del detalle del turno, nombrada por su título (h3). */
export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} style={{ ...tituloSeccion, fontSize: 14 }}>{titulo}</h3>
      {children}
    </section>
  )
}
