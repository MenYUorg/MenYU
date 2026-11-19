import type { ReactNode } from 'react'
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
  /** Las acciones al lado del campo (los botones), en la misma fila. */
  children: ReactNode
}

/**
 * El nombre de una caja (#360), en el alta y al renombrar: hasta 60 caracteres, con su error asociado al campo. Es dueño
 * de la fila: el campo y las acciones van juntos y el error va debajo, así los botones no se mueven cuando aparece.
 */
export function CampoDeNombre({ id, valor, error, onChange, className, placeholder, autoFocus, children }: CampoDeNombreProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
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
        {children}
      </div>
      {error !== null && <p id={`${id}-error`} role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
