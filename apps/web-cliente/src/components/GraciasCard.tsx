import { useId, useRef } from 'react'
import { useFocoDelDialogo } from '../hooks/useFocoDelDialogo'

const C = {
  orange: '#E8563A',
  navy: '#2D3561',
  textSub: '#6B7280',
} as const

interface GraciasCardProps {
  subtitulo: string
  onSalir: () => void
  /**
   * `true` cuando la tarjeta aparece encima de otra pantalla (el local cerró o cobró la sesión): es un diálogo de alerta,
   * el foco va a su mensaje y su título es un `<h2>` (la pantalla de abajo ya tiene su `<h1>`). Sin esto es la pantalla
   * de `/pago/exitoso`, y el título es el `<h1>` de la página.
   */
  comoDialogo?: boolean
}

export function GraciasCard({ subtitulo, onSalir, comoDialogo = false }: GraciasCardProps) {
  const idDelTitulo = useId()
  const idDelSubtitulo = useId()
  const titulo = useRef<HTMLHeadingElement>(null)
  useFocoDelDialogo(comoDialogo, titulo)
  const Titulo = comoDialogo ? 'h2' : 'h1'

  return (
    <div
      role={comoDialogo ? 'alertdialog' : undefined}
      aria-modal={comoDialogo ? true : undefined}
      aria-labelledby={comoDialogo ? idDelTitulo : undefined}
      aria-describedby={comoDialogo ? idDelSubtitulo : undefined}
      style={{
        background: 'white',
        borderRadius: 16,
        padding: '40px 32px',
        maxWidth: 340,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 8px 28px rgba(0,0,0,0.10)',
      }}
    >
      {/* El tilde es solo para la vista: el título ya dice lo que pasó. */}
      <div aria-hidden="true" style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#FDF0ED',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke={C.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <Titulo
        ref={titulo}
        id={idDelTitulo}
        tabIndex={comoDialogo ? -1 : undefined}
        style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 800, fontSize: 22,
          color: C.navy, margin: 0,
          letterSpacing: '-0.01em',
          textAlign: 'center',
        }}
      >
        ¡Gracias por su visita!
      </Titulo>
      <p id={idDelSubtitulo} style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 14, color: C.textSub,
        margin: 0, textAlign: 'center',
        lineHeight: 1.5,
      }}>
        {subtitulo}
      </p>
      <button
        onClick={onSalir}
        onMouseEnter={e => e.currentTarget.style.background = '#d34a30'}
        onMouseLeave={e => e.currentTarget.style.background = C.orange}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '14px 0',
          background: C.orange,
          color: 'white',
          border: 'none',
          borderRadius: 12,
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize: 15,
          cursor: 'pointer',
          transition: 'background .14s',
        }}
      >
        Salir
      </button>
    </div>
  )
}
