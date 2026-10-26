import type { ReactNode } from 'react'

interface AvisoProps {
  tipo: 'error' | 'info'
  children: ReactNode
}

/** Un error (lo anuncia el lector de pantalla en el momento) o una confirmación. */
export function Aviso({ tipo, children }: AvisoProps) {
  return tipo === 'error' ? (
    <p role="alert" className="rounded-lg bg-menyu-error-suave px-4 py-3 text-sm text-menyu-error">
      {children}
    </p>
  ) : (
    <p role="status" className="rounded-lg border-l-4 border-menyu-coral bg-menyu-fondo px-4 py-3 text-sm">
      {children}
    </p>
  )
}
