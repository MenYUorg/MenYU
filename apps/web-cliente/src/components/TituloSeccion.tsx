import type { ReactNode } from 'react'
import { C } from '../theme'

/** Encabezado de sección: mayúsculas con el subrayado naranja (el mismo del menú). */
export function TituloSeccion({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      style={{
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 800,
        fontSize: 13,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: C.navy,
        margin: '0 0 12px',
        paddingBottom: 8,
        borderBottom: `2px solid ${C.orange}`,
        display: 'inline-block',
      }}
    >
      {children}
    </h2>
  )
}
