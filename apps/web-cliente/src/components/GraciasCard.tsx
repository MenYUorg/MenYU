const C = {
  orange: '#E8563A',
  navy: '#2D3561',
  textSub: '#6B7280',
} as const

interface GraciasCardProps {
  subtitulo: string
  onSalir: () => void
}

export function GraciasCard({ subtitulo, onSalir }: GraciasCardProps) {
  return (
    <div style={{
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
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#FDF0ED',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke={C.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p style={{
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 800, fontSize: 22,
        color: C.navy, margin: 0,
        letterSpacing: '-0.01em',
        textAlign: 'center',
      }}>
        ¡Gracias por su visita!
      </p>
      <p style={{
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
