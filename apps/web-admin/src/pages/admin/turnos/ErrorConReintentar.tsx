import { Button } from '@menyu/ui'

/** Un error de lectura que se puede reintentar, en la lista y en el detalle. */
export function ErrorConReintentar({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
      <p>{mensaje}</p>
      <Button variant="secondary" size="sm" onClick={onReintentar}>Reintentar</Button>
    </div>
  )
}
