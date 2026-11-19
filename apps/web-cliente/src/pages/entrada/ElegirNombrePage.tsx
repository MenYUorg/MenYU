import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { useSessionStore } from '../../store/sessionStore'
import { useComensalStore } from '../../store/comensalStore'
import { C } from '../../theme'

// ── Shared sub-components ─────────────────────────────────────────────────────

function ErrorBanner({ id, message }: { id: string; message: string }) {
  return (
    <div id={id} role="alert" style={{
      background: C.orangeSoft,
      border: `1px solid ${C.orange}`,
      borderRadius: 10,
      padding: '10px 14px',
    }}>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.error, margin: 0 }}>
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
  // El error es porque falta el nombre (y no, por ejemplo, porque el servidor lo rechazó): el campo queda inválido.
  const [faltaElNombre, setFaltaElNombre] = useState(false)
  const idDelCampo = useId()
  const idDelError = useId()
  const campo = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    // "Continuar" no se apaga con el campo vacío (no diría por qué): al tocarlo se anuncia qué falta y el foco vuelve al campo.
    if (nombre.trim().length === 0) {
      setError('Escribí tu nombre para continuar.')
      setFaltaElNombre(true)
      campo.current?.focus()
      return
    }
    if (!sesionId) return

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

      <main style={{
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
              <label htmlFor={idDelCampo} style={labelStyle}>Tu nombre</label>
              {/* Sin `autoFocus`: al llegar el foco va al título (components/SeguimientoDeRuta.tsx) y el lector lo lee con la
                  explicación antes del campo; con el foco en el campo, el teclado del celular se abre y tapa todo. */}
              <input
                ref={campo}
                id={idDelCampo}
                type='text'
                autoComplete='name'
                placeholder='Ej: Juan'
                value={nombre}
                aria-invalid={faltaElNombre ? true : undefined}
                aria-describedby={error ? idDelError : undefined}
                onChange={(e) => { setNombre(e.target.value); setError(null); setFaltaElNombre(false) }}
                style={inputStyle}
              />
            </div>

            {error && <ErrorBanner id={idDelError} message={error} />}

            {/* Mientras se envía no se deshabilita (perdería el foco): se marca `aria-disabled` y no hace nada. */}
            <button type='submit' aria-disabled={isSubmitting} style={submitBtnStyle(isSubmitting)}>
              {isSubmitting ? 'Ingresando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </main>
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
  border: `1.5px solid ${C.borderInput}`,
  borderRadius: 10,
  fontFamily: 'Inter, sans-serif',
  fontSize: 15,
  color: '#1A1A2E',
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
