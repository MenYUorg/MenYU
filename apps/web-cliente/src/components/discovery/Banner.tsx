import type { ReactNode } from 'react'
import { C } from '../../theme'

interface BannerProps {
  /** `error`: fondo naranja suave y texto rojo (algo salió mal). `info`: aviso neutro (por ejemplo, "usá el PIN"). */
  tipo: 'error' | 'info'
  children: ReactNode
}

/** Aviso dentro de una pantalla: el banner de error de siempre y uno neutro. */
export function Banner({ tipo, children }: BannerProps) {
  const error = tipo === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      style={{
        background: error ? C.orangeSoft : C.white,
        border: `1px solid ${error ? C.orange : C.borderInput}`,
        borderRadius: 10,
        padding: '12px 16px',
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        lineHeight: 1.45,
        color: error ? C.error : C.textSub,
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </div>
  )
}
