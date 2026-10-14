import { C } from '../../theme'

/** El círculo naranja que gira: "Buscando…" en el home y "Abriendo tu mesa…" en `/check-in`. */
export function Girando({ tam = 16 }: { tam?: number }) {
  return (
    <svg className="animate-spin" width={tam} height={tam} viewBox="0 0 24 24" fill="none" style={{ color: C.orange, flexShrink: 0 }} aria-hidden="true">
      <circle opacity=".25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path opacity=".75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
