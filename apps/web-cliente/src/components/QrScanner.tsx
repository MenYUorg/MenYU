import { useEffect, useRef, useState } from 'react'
import { C } from '../theme'

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

// ── QR Scanner overlay ────────────────────────────────────────────────────────

interface QrScannerProps {
  onDetected: (raw: string) => void
  onCancel: () => void
}

export function QrScanner({ onDetected, onCancel }: QrScannerProps) {
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
