import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { ImagenLogo } from './ImagenLogo'
import type { ModoMenu } from './modo'
import { CM } from './paleta'

function HamburgerBadge() {
  return (
    <span style={{
      position: 'absolute', bottom: -4, right: -4, zIndex: 1,
      width: 16, height: 16, borderRadius: '50%',
      background: 'white', border: `2px solid ${CM.navy}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 2,
      padding: '2.5px 3px', boxSizing: 'border-box',
    }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: '100%', height: 1.5, background: CM.navy, borderRadius: 1, display: 'block' }} />
      ))}
    </span>
  )
}

const PILL: React.CSSProperties = {
  borderRadius: 999,
  fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
  textAlign: 'center', whiteSpace: 'nowrap',
}

/** "Mesa N", y debajo "PIN xxx" si la mesa está en modo seguro: apilados para dejarle lugar al nombre del restaurante. */
function MesaYCodigo() {
  const numeroMesa = useSessionStore((s) => s.numeroMesa)
  const codigoSesion = useSessionStore((s) => s.codigoSesion)
  const modoSesion = useSessionStore((s) => s.modoSesion)
  const conCodigo = modoSesion === 'seguro' && !!codigoSesion

  if (!conCodigo) {
    // Sin código, solo la mesa, como siempre.
    return (
      <span style={{ ...PILL, flexShrink: 0, background: CM.orange, color: 'white', padding: '6px 11px' }}>
        Mesa {numeroMesa ?? ''}
      </span>
    )
  }

  // Los dos con el mismo borde (uno lo lleva visible y el otro no) para que midan lo mismo.
  const apilada: React.CSSProperties = { ...PILL, padding: '2px 11px', lineHeight: 1.3, border: '1.5px solid transparent' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
      <span style={{ ...apilada, background: CM.orange, borderColor: CM.orange, color: 'white' }}>
        Mesa {numeroMesa ?? ''}
      </span>
      <span style={{ ...apilada, borderColor: 'rgba(255,255,255,0.5)', color: 'white' }}>
        PIN {codigoSesion}
      </span>
    </div>
  )
}

/** "Mozo" y la mesa (con el código si está en modo seguro): lo que solo tiene el menú de una sesión. */
function MozoYMesa() {
  const sesionId = useSessionStore((s) => s.sesionId)
  const mesaId = useSessionStore((s) => s.mesaId)
  const jwt = useSessionStore((s) => s.jwt)
  const [mozoStatus, setMozoStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const mozoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (mozoTimer.current) clearTimeout(mozoTimer.current) }, [])

  const handleCallMozo = async () => {
    if (mozoStatus !== 'idle' || !sesionId || !jwt) return
    setMozoStatus('loading')
    try {
      await api.waiterCalls.llamar(sesionId, jwt)
      setMozoStatus('ok')
    } catch {
      setMozoStatus('error')
    }
    mozoTimer.current = setTimeout(() => setMozoStatus('idle'), 3000)
  }

  const mozoLabel =
    mozoStatus === 'loading' ? 'Llamando…' :
    mozoStatus === 'ok'      ? '¡En camino!' :
    mozoStatus === 'error'   ? 'Error' :
                               'Mozo'

  return (
    <>
      {sesionId && jwt && (
        <button
          onClick={() => void handleCallMozo()}
          disabled={mozoStatus !== 'idle'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '7px 10px', borderRadius: 999, flexShrink: 0,
            background: mozoStatus === 'ok' ? '#22c55e' : 'transparent',
            color: 'white',
            border: `1.5px solid ${mozoStatus === 'ok' ? '#22c55e' : 'rgba(255,255,255,0.32)'}`,
            fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 11,
            cursor: mozoStatus === 'idle' ? 'pointer' : 'default',
            transition: 'all 0.2s',
          }}
        >
          <span style={{ fontSize: 12 }}>🔔</span> {mozoLabel}
        </button>
      )}

      {mesaId && <MesaYCodigo />}
    </>
  )
}

interface MenuHeaderProps {
  nombre: string
  /** El logo del restaurante (o el de su marca) ya resuelto; `null` si ninguno tiene: se muestra el de MenYU. */
  logoUrl: string | null
  modo: ModoMenu
  /** Abre el menú lateral. */
  onAbrirMenu: () => void
}

/**
 * La barra de arriba del menú: el logo del restaurante (que es el botón del menú lateral), su nombre y, en la mesa,
 * "Mozo" y la mesa. El nombre puede ocupar dos líneas.
 */
export function MenuHeader({ nombre, logoUrl, modo, onAbrirMenu }: MenuHeaderProps) {
  return (
    <header style={{
      background: CM.navy, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
    }}>
      {/* Se ve de 40 px y se toca como uno de 44 (el ::after) */}
      <button
        onClick={onAbrirMenu}
        aria-label="Abrir el menú"
        className="after:absolute after:-inset-0.5 after:content-['']"
        style={{
          width: 40, height: 40, padding: 4, borderRadius: 10, flexShrink: 0, boxSizing: 'border-box',
          background: 'white', border: 'none', cursor: 'pointer', position: 'relative',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <ImagenLogo logoUrl={logoUrl} />
        <HamburgerBadge />
      </button>

      <div style={{
        flex: 1, minWidth: 0,
        fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, lineHeight: 1.2, color: 'white',
        overflowWrap: 'anywhere',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {nombre}
      </div>

      {modo === 'mesa' && <MozoYMesa />}
    </header>
  )
}
