import { Spinner } from '@menyu/ui'

/** Una lectura en curso, con su nombre accesible (`etiqueta`), en la lista y en el detalle. */
export function Cargando({ etiqueta }: { etiqueta: string }) {
  return <div role="status" aria-label={etiqueta} className="flex justify-center py-16"><Spinner size="lg" /></div>
}
