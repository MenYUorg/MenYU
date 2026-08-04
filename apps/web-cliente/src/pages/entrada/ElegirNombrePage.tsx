import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { useSessionStore } from '../../store/sessionStore'
import { useComensalStore } from '../../store/comensalStore'

const C = {
  orange: '#E8563A',
  orangeHover: '#d34a30',
  navy: '#2D3561',
  textSub: '#6B7280',
  border: '#DDDDE0',
  borderFocus: '#E8563A',
  bg: '#F7F7F8',
  white: '#FFFFFF',
} as const

// ── Shared sub-components ─────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      background: '#FDE5DF',
      border: `1px solid ${C.orange}`,
      borderRadius: 10,
      padding: '10px 14px',
    }}>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c0392b', margin: 0 }}>
        {message}
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ElegirNombrePage() {
  const navigate = useNavigate()
  const sesionId = useSessionStore((s) => s.sesionId)
  const esAnfitrion = useSessionStore((s) => s.esAnfitrion)

  const [nombre, setNombre] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeContinuar = nombre.trim().length > 0 && !isSubmitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nombre.trim().length === 0 || isSubmitting || !sesionId) return

    setError(null)
    setIsSubmitting(true)
    try {
      await useComensalStore.getState().crearComensal(sesionId, nombre.trim(), esAnfitrion)
      const { comensalId, error: comensalError } = useComensalStore.getState()
      if (comensalId) {
        navigate('/menu', { replace: true })
      } else {
        setError(comensalError ?? 'No se pudo registrar tu nombre. Intentá de nuevo.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <AppHeader />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '80px 24px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 380, marginTop: 32 }}>
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize: 26,
            color: C.navy,
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
          }}>
            ¿Cómo te llamás?
          </h1>
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 15,
            color: C.textSub,
            margin: '0 0 28px',
            lineHeight: 1.5,
          }}>
            Así te reconocemos en la mesa y sabemos qué pediste vos.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Tu nombre</label>
              <input
                type='text'
                autoComplete='name'
                autoFocus
                placeholder='Ej: Juan'
                value={nombre}
                onChange={(e) => { setNombre(e.target.value); setError(null) }}
                style={inputStyle}
              />
            </div>

            {error && <ErrorBanner message={error} />}

            <button type='submit' disabled={!puedeContinuar} style={submitBtnStyle(!puedeContinuar)}>
              {isSubmitting ? 'Ingresando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  color: '#374151',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: '#FFFFFF',
  border: '1.5px solid #DDDDE0',
  borderRadius: 10,
  fontFamily: 'Inter, sans-serif',
  fontSize: 15,
  color: '#1A1A2E',
  outline: 'none',
  boxSizing: 'border-box',
}

function submitBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '15px 0',
    background: disabled ? '#ccc' : C.orange,
    color: C.white,
    border: 'none',
    borderRadius: 14,
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 700,
    fontSize: 16,
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: 4,
  }
}
