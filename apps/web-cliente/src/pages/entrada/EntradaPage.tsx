import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { useSessionStore } from '../../store/sessionStore'

const C = {
  orange: '#E8563A',
  orangeHover: '#d34a30',
  navy: '#2D3561',
  text: '#1A1A2E',
  textSub: '#6B7280',
  bg: '#F7F7F8',
  white: '#FFFFFF',
} as const

// ── BarcodeDetector type shim ─────────────────────────────────────────────────

type BarcodeResult = { rawValue: string }

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>
}

interface BarcodeDetectorConstructable {
  new(options?: { formats?: string[] }): BarcodeDetectorLike
}

function getBarcodeDetector(): BarcodeDetectorConstructable | null {
  if ('BarcodeDetector' in window) {
    return (window as unknown as { BarcodeDetector: BarcodeDetectorConstructable }).BarcodeDetector
  }
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractQrToken(raw: string): string {
  try {
    const url = new URL(raw)
    const token =
      url.searchParams.get('qrToken') ??
      url.searchParams.get('tableCode') ??
      url.pathname.split('/').filter(Boolean).pop()
    return token ?? raw
  } catch {
    return raw
  }
}

// ── QR Scanner overlay ────────────────────────────────────────────────────────

interface QrScannerProps {
  onDetected: (raw: string) => void
  onCancel: () => void
}

function QrScanner({ onDetected, onCancel }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeRef = useRef(true)
  const [camError, setCamError] = useState<string | null>(null)

  useEffect(() => {
    const DetectorClass = getBarcodeDetector()
    if (!DetectorClass) {
      setCamError('Tu navegador no soporta el escáner QR. Usá Chrome o ingresá con PIN.')
      return
    }

    const detector = new DetectorClass({ formats: ['qr_code'] })

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (!activeRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        void video.play()

        intervalRef.current = setInterval(() => {
          if (!activeRef.current || !video) return
          if (video.readyState < 2) return
          void detector.detect(video).then((results) => {
            if (!activeRef.current) return
            if (results[0]) {
              activeRef.current = false
              clearInterval(intervalRef.current!)
              streamRef.current?.getTracks().forEach((t) => t.stop())
              onDetected(results[0].rawValue)
            }
          })
        }, 250)
      })
      .catch(() => {
        if (activeRef.current) setCamError('No se pudo acceder a la cámara.')
      })

    return () => {
      activeRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetected])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.92)',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
    }}>
      <p style={{
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700,
        fontSize: 18,
        color: C.white,
        margin: 0,
      }}>
        Apuntá la cámara al QR de la mesa
      </p>

      {camError ? (
        <div style={{
          background: 'rgba(232,86,58,0.15)',
          border: '1px solid #E8563A',
          borderRadius: 12,
          padding: '16px 24px',
          maxWidth: 300,
          textAlign: 'center',
        }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#fca9a9', margin: 0 }}>
            {camError}
          </p>
        </div>
      ) : (
        <div style={{ position: 'relative', width: 260, height: 260 }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: 260,
              height: 260,
              objectFit: 'cover',
              borderRadius: 16,
              display: 'block',
            }}
          />
          {/* Corner frame decorators */}
          {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
            <div key={pos} style={{
              position: 'absolute',
              width: 28, height: 28,
              borderColor: C.orange,
              borderStyle: 'solid',
              borderWidth: 0,
              ...(pos === 'tl' ? { top: 4, left: 4, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 } : {}),
              ...(pos === 'tr' ? { top: 4, right: 4, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 } : {}),
              ...(pos === 'bl' ? { bottom: 4, left: 4, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 } : {}),
              ...(pos === 'br' ? { bottom: 4, right: 4, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 } : {}),
            }} />
          ))}
        </div>
      )}

      <button
        onClick={onCancel}
        style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 600,
          fontSize: 15,
          color: C.white,
          background: 'rgba(255,255,255,0.12)',
          border: '1.5px solid rgba(255,255,255,0.25)',
          borderRadius: 10,
          padding: '12px 32px',
          cursor: 'pointer',
        }}
      >
        Cancelar
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function EntradaPage() {
  const navigate = useNavigate()
  const openSession = useSessionStore((s) => s.openSession)
  const sessionError = useSessionStore((s) => s.error)
  const loading = useSessionStore((s) => s.loading)

  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [btnHover, setBtnHover] = useState(false)

  const handleDetected = async (raw: string) => {
    setError(null)
    setScanning(false)
    const qrToken = extractQrToken(raw)
    const result = await openSession({ qrToken })
    if (result && !result.error) {
      navigate('/menu')
    } else if (result?.error === 'REQUIERE_CODIGO_SESION') {
      navigate('/menu')
    } else {
      setError(sessionError ?? 'No se pudo abrir la sesión. Intentá de nuevo.')
    }
  }

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
