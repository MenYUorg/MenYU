import { useState, type InputHTMLAttributes } from 'react'

interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string
  etiqueta: string
  ayuda?: string
  error?: string | null
}

/** Etiqueta, input y texto de ayuda o de error. Los de contraseña se pueden mostrar. */
export function Campo({ id, etiqueta, ayuda, error, type = 'text', className, ...resto }: CampoProps) {
  const [visible, setVisible] = useState(false)
  const esContrasena = type === 'password'
  const descripcion = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          type={esContrasena && visible ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion}
          className={`h-12 w-full rounded-lg border bg-white px-3.5 text-base text-menyu-navy caret-menyu-coral transition-colors focus:border-menyu-navy focus:outline-none focus:ring-2 focus:ring-menyu-coral/70 ${
            error ? 'border-menyu-error' : 'border-menyu-borde'
          } ${esContrasena ? 'pr-20' : ''}`}
          {...resto}
        />
        {esContrasena && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-controls={id}
            className="absolute inset-y-1.5 right-1.5 rounded-md px-3 text-sm font-medium text-menyu-gris hover:bg-menyu-fondo hover:text-menyu-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-menyu-coral"
          >
            {visible ? 'Ocultar' : 'Mostrar'}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-menyu-error">
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={`${id}-ayuda`} className="mt-1.5 text-sm text-menyu-gris">
            {ayuda}
          </p>
        )
      )}
    </div>
  )
}
