import { useEffect, useRef, type ReactNode } from 'react'
import { campo, etiquetaCampo, mensajeDeFalla } from '../asistente/estilos'

interface CampoDeNombreProps {
  /** La base de los ids del campo y de su error (un `useId` de quien lo usa). */
  id: string
  /** La etiqueta del campo ("Nombre de la caja"). */
  etiqueta: string
  maximo: number
  valor: string
  /** El error del nombre, junto al campo; null si no hay. */
  error: string | null
  onChange: (valor: string) => void
  placeholder?: string
  /** Lleva el foco al campo cuando se monta (al abrir "Renombrar"; el alta no lo pide). */
  enfocarAlMontar?: boolean
  /** Las acciones al lado del campo (los botones), en la misma fila. */
  children: ReactNode
}

/**
 * El nombre de un ítem del ABM, en el alta y al renombrar, con su error asociado al campo. Es dueño de la fila: el campo
 * y las acciones van juntos y el error va debajo, así los botones no se mueven cuando aparece.
 */
export function CampoDeNombre({ id, etiqueta, maximo, valor, error, onChange, placeholder, enfocarAlMontar, children }: CampoDeNombreProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (enfocarAlMontar) inputRef.current?.focus()
  }, [enfocarAlMontar])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-end gap-2">
        <div style={{ flex: 1, minWidth: 0, maxWidth: 360 }}>
          <label htmlFor={`${id}-nombre`} style={etiquetaCampo}>{etiqueta}</label>
          <input
            id={`${id}-nombre`}
            type="text"
            style={campo}
            value={valor}
            maxLength={maximo}
            placeholder={placeholder}
            ref={inputRef}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : `${id}-error`}
          />
        </div>
        {children}
      </div>
      {error !== null && <p id={`${id}-error`} role="alert" style={mensajeDeFalla}>{error}</p>}
    </div>
  )
}
