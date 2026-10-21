import type { ButtonHTMLAttributes } from 'react'

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario'
  /** Mientras carga, el botón queda deshabilitado y muestra este texto. */
  cargando?: string | false
}

const VARIANTES = {
  primario: 'bg-menyu-navy text-white hover:bg-menyu-navy-hover',
  secundario: 'border border-menyu-navy text-menyu-navy hover:bg-menyu-fondo',
}

export function Boton({ variante = 'primario', cargando = false, disabled, children, className = '', ...resto }: BotonProps) {
  return (
    <button
      disabled={disabled || Boolean(cargando)}
      className={`h-12 w-full rounded-lg px-5 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-menyu-coral focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTES[variante]} ${className}`}
      {...resto}
    >
      {cargando || children}
    </button>
  )
}
