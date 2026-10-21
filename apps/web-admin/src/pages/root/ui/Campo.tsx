import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { AlertTriangle } from 'lucide-react'

interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  etiqueta: string
  error?: string
  ayuda?: ReactNode
  monoespaciado?: boolean
}

/** Etiqueta, campo (16 px para que el celular no haga zoom), error y ayuda, enlazados para lectores de pantalla. */
export function Campo({ etiqueta, error, ayuda, monoespaciado = false, style, ...resto }: CampoProps) {
  const id = useId()
  const idError = `${id}-error`
  const idAyuda = `${id}-ayuda`
  const describe = [error ? idError : '', ayuda ? idAyuda : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={`campo${error ? ' con-error' : ''}`}>
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={describe}
        style={monoespaciado ? { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 15, ...style } : style}
        {...resto}
      />
      {error && (
        <p className="error" id={idError}>
          <AlertTriangle size={14} aria-hidden="true" />
          {error}
        </p>
      )}
      {ayuda && (
        <p className="ayuda" id={idAyuda}>
          {ayuda}
        </p>
      )}
    </div>
  )
}

/** Un menú desplegable con la misma etiqueta y medidas que `Campo`. */
export function CampoSelect({
  etiqueta,
  opciones,
  ...resto
}: { etiqueta: string; opciones: Array<{ valor: string; texto: string }> } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'>) {
  const id = useId()
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} {...resto}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Un dato que se ve pero no se edita (la marca de un restaurante, su dirección). */
export function CampoFijo({ etiqueta, icono, texto, ayuda }: { etiqueta: string; icono: ReactNode; texto: string; ayuda?: ReactNode }) {
  return (
    <div className="campo">
      <span className="etiqueta-fija" style={{ display: 'block', font: '600 13px Montserrat, sans-serif', color: 'var(--navy)', marginBottom: 6 }}>
        {etiqueta}
      </span>
      <div className="fijo">
        {icono}
        <span className="cortar">{texto}</span>
      </div>
      {ayuda && <p className="ayuda">{ayuda}</p>}
    </div>
  )
}
