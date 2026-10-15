import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@menyu/ui'
import { useSessionStore } from '../../store/sessionStore'
import { api } from '../../services/api'
import { C } from '../../theme'

const CANTIDAD_MIN = 1
const CANTIDAD_MAX = 99

export function CantidadComensalesPage() {
  const navigate = useNavigate()

  const sesionId = useSessionStore((s) => s.sesionId)
  const jwt = useSessionStore((s) => s.jwt)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalSesion, setTotalSesion] = useState<number | null>(null)

  const [cantidad, setCantidad] = useState(1)
  const [editando, setEditando] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(() => {
    if (!sesionId || !jwt) { setLoading(false); setError('No hay sesión activa'); return }
    setLoading(true)
    setError(null)
    api.sesiones.saldo(jwt, sesionId)
      .then((saldo) => {
        setTotalSesion(saldo.totalSesion)
        setCantidad(1)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Error al cargar los datos de la sesión')
        setLoading(false)
      })
  }, [sesionId, jwt])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (editando) inputRef.current?.focus()
  }, [editando])

  // No se persiste nada: el mensaje es total/N puro con el N que el usuario eligió.
  const montoPorPersona = totalSesion !== null ? totalSesion / cantidad : null

  function ajustar(delta: number) {
    setCantidad((c) => Math.max(CANTIDAD_MIN, Math.min(CANTIDAD_MAX, c + delta)))
  }

  function abrirEdicion() {
    setInputValue(String(cantidad))
    setEditando(true)
  }

  function commitEdicion() {
    const n = parseInt(inputValue, 10)
    if (!Number.isNaN(n)) setCantidad(Math.max(CANTIDAD_MIN, Math.min(CANTIDAD_MAX, n)))
    setEditando(false)
  }

  function handleContinuar() {
    navigate(`/dividir/mensaje?cantidad=${cantidad}`)
  }

  const header = (
    <header style={{
      background:  C.navy,
      display:     'flex',
      alignItems:  'center',
      padding:     '14px 16px',
      gap:         12,
      flexShrink:  0,
    }}>
      <button
        onClick={() => navigate('/pagar')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'white', fontSize: 22, lineHeight: 1,
          padding: '2px 8px 2px 0', display: 'flex', alignItems: 'center',
        }}
        aria-label="Volver"
      >
        ←
      </button>
      <span style={{
        flex: 1, fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700, fontSize: 17, color: 'white', textAlign: 'center',
      }}>
        ¿Cuántos son?
      </span>
      <div style={{ width: 38 }} />
    </header>
  )

  const wrapper = (children: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
      <div style={{
        maxWidth: 520, width: '100%', margin: '0 auto',
        background: 'white', minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {header}
        {children}
      </div>
    </div>
  )

  if (loading) return wrapper(
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size="md" />
    </div>,
  )

  if (error) return wrapper(
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#DC2626', margin: 0 }}>{error}</p>
      <button
        onClick={cargar}
        style={{
          background: C.orange, color: 'white', border: 'none',
          borderRadius: 10, padding: '10px 20px',
          fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
    </div>,
  )

  return wrapper(
    <>
      <div style={{ flex: 1, padding: '24px 16px 180px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray, margin: 0 }}>
            Cantidad de comensales
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <button
              onClick={() => ajustar(-1)}
              disabled={cantidad <= CANTIDAD_MIN}
              aria-label="Restar"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                border: `1.5px solid ${C.border}`, background: 'white',
                fontSize: 20, color: C.navy, cursor: 'pointer',
                opacity: cantidad <= CANTIDAD_MIN ? 0.4 : 1,
              }}
            >
              −
            </button>

            {editando ? (
              <input
                ref={inputRef}
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={commitEdicion}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdicion() }}
                style={{
                  width: 64, textAlign: 'center',
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 32,
                  color: C.navy, border: `1.5px solid ${C.orange}`, borderRadius: 10,
                  padding: '4px 0',
                }}
              />
            ) : (
              <button
                onClick={abrirEdicion}
                aria-label="Editar cantidad"
                style={{
                  minWidth: 64, background: 'none', border: 'none',
                  fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 32,
                  color: C.navy, cursor: 'pointer',
                }}
              >
                {cantidad}
              </button>
            )}

            <button
              onClick={() => ajustar(1)}
              disabled={cantidad >= CANTIDAD_MAX}
              aria-label="Sumar"
              style={{
                width: 44, height: 44, borderRadius: '50%',
                border: `1.5px solid ${C.border}`, background: 'white',
                fontSize: 20, color: C.navy, cursor: 'pointer',
                opacity: cantidad >= CANTIDAD_MAX ? 0.4 : 1,
              }}
            >
              +
            </button>
          </div>
        </div>

        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.gray }}>
            Cada persona paga
          </span>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 22, color: C.navy }}>
            {montoPorPersona !== null ? `$${montoPorPersona.toFixed(2)}` : '—'}
          </span>
        </div>
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 520, background: 'white',
        borderTop: `1px solid ${C.border}`, padding: '14px 16px 24px',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
      }}>
        <button
          onClick={handleContinuar}
          style={{
            width: '100%', padding: '14px 16px',
            background: C.orange, color: 'white', border: 'none',
            borderRadius: 14, fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}
        >
          Continuar
        </button>
      </div>
    </>,
  )
}
