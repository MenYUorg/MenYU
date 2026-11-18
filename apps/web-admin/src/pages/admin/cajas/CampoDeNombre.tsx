import { Input } from '@menyu/ui'
import { MAXIMO_NOMBRE_DE_CAJA } from './nombre'

interface CampoDeNombreProps {
  /** La base de los ids del campo y de su error (un `useId` de quien lo usa). */
  id: string
  valor: string
  /** El error del nombre, junto al campo; null si no hay. */
  error: string | null
  onChange: (valor: string) => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
}

/** El nombre de una caja (#360), en el alta y al renombrar: hasta 60 caracteres, con su error asociado al campo. */
export function CampoDeNombre({ id, valor, error, onChange, className, placeholder, autoFocus }: CampoDeNombreProps) {
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={`${id}-nombre`}
        label="Nombre de la caja"
        value={valor}
        maxLength={MAXIMO_NOMBRE_DE_CAJA}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={className}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${id}-error`}
      />
      {error !== null && <p id={`${id}-error`} role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
