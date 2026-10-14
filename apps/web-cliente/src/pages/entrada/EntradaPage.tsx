import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { QrScanner } from '../../components/QrScanner'
import { useEntrarAMesa } from '../../hooks/useEntrarAMesa'
import { extractQrToken } from '../../utils/qr'

const C = {
  orange: '#E8563A',
  orangeHover: '#d34a30',
  navy: '#2D3561',
  text: '#1A1A2E',
  textSub: '#6B7280',
  bg: '#F7F7F8',
  white: '#FFFFFF',
} as const

// ── Page ──────────────────────────────────────────────────────────────────────

export function EntradaPage() {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [btnHover, setBtnHover] = useState(false)

  const { entrar, cargando: loading, pantalla } = useEntrarAMesa({
    alFallar: () => setError('No se pudo abrir la sesión. Intentá de nuevo.'),
  })

  const handleDetected = (raw: string) => {
    setError(null)
    setScanning(false)
    void entrar({ qrToken: extractQrToken(raw) })
  }

  if (pantalla) return pantalla

  return (
    <>
      {scanning && (
        <QrScanner
          onDetected={handleDetected}
          onCancel={() => setScanning(false)}
        />
      )}

      <div style={{ minHeight: '100vh', background: C.bg }}>
        <AppHeader />

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '80px 24px 40px',
          gap: 0,
        }}>
          {/* Icon */}
          <div style={{
            width: 80, height: 80,
            borderRadius: '50%',
            background: '#FDE5DF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3" />
            </svg>
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize: 28,
            color: C.navy,
            margin: '0 0 10px',
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}>
            Ingresar a mi mesa
          </h1>
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 15,
            color: C.textSub,
            margin: '0 0 36px',
            textAlign: 'center',
            maxWidth: 280,
            lineHeight: 1.5,
          }}>
            Escaneá el código QR de tu mesa para ver el menú y hacer pedidos.
          </p>

          {/* Error */}
          {error && (
            <div style={{
              background: '#FDE5DF',
              border: `1px solid ${C.orange}`,
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 20,
              maxWidth: 320,
              width: '100%',
            }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c0392b', margin: 0, textAlign: 'center' }}>
                {error}
              </p>
            </div>
          )}

          {/* Scan button */}
          <button
            onClick={() => { setError(null); setScanning(true) }}
            disabled={loading}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              width: '100%',
              maxWidth: 320,
              padding: '16px 0',
              background: loading ? '#ccc' : btnHover ? C.orangeHover : C.orange,
              color: C.white,
              border: 'none',
              borderRadius: 14,
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: 16,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background .14s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7V1h-6M1 7V1h6M23 17v6h-6M1 17v6h6" />
            </svg>
            {loading ? 'Abriendo sesión...' : 'Escanear QR'}
          </button>

          {/* PIN link */}
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 14,
            color: C.textSub,
            marginTop: 20,
            textAlign: 'center',
          }}>
            ¿No tenés el QR?{' '}
            <Link
              to="/ingresar-pin"
              style={{
                color: C.orange,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Ingresar con PIN
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
