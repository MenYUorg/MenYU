import type { ReactNode } from 'react'
import { botonSecundario } from '../marca/estilos'
import { bannerError } from '../cajas/estilos'

/** Un error de lectura con lo que se puede hacer (`children`), en la lista y en el detalle. */
export function AlertaDeError({ mensaje, children }: { mensaje: string; children: ReactNode }) {
  return (
    <div role="alert" style={{ ...bannerError, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
      <p style={{ margin: 0 }}>{mensaje}</p>
      {children}
    </div>
  )
}

/** Un error de lectura que se puede reintentar. */
export function ErrorConReintentar({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <AlertaDeError mensaje={mensaje}>
      <button type="button" onClick={onReintentar} style={botonSecundario}>Reintentar</button>
    </AlertaDeError>
  )
}
