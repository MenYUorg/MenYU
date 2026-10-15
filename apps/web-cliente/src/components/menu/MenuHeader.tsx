import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { iniciales } from '../../utils/iniciales'
import type { ModoMenu } from './modo'
import { CM } from './paleta'

function HamburgerBadge() {
  return (
    <span style={{
      position: 'absolute', bottom: -3, right: -3,
      width: 15, height: 15, borderRadius: '50%',
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

/** "Mozo" y el número de la mesa (con el código si la mesa está en modo seguro): lo que solo tiene el menú de una sesión. */
function MozoYMesa() {
  const sesionId = useSessionStore((s) => s.sesionId)
  const mesaId = useSessionStore((s) => s.mesaId)
  const jwt = useSessionStore((s) => s.jwt)
  const numeroMesa = useSessionStore((s) => s.numeroMesa)
  const codigoSesion = useSessionStore((s) => s.codigoSesion)
  const modoSesion = useSessionStore((s) => s.modoSesion)
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

      {mesaId && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{
            background: CM.orange, color: 'white',
            padding: '6px 11px', borderRadius: 999,
            fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
          }}>
            Mesa {numeroMesa ?? ''}
          </span>
          {modoSesion === 'seguro' && codigoSesion && (
            <span style={{
              color: 'white',
              padding: '6px 11px', borderRadius: 999,
              fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
              border: '1.5px solid rgba(255,255,255,0.5)',
            }}>
              PIN {codigoSesion}
            </span>
          )}
        </div>
      )}
    </>
  )
}

interface MenuHeaderProps {
  nombre: string
  modo: ModoMenu
  /** Abre el menú lateral. */
  onAbrirMenu: () => void
}

/** La barra de arriba del menú: el botón del menú lateral, el nombre del restaurante y, en la mesa, "Mozo" y la mesa. */
export function MenuHeader({ nombre, modo, onAbrirMenu }: MenuHeaderProps) {
  return (
    <header style={{
      background: CM.navy, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
    }}>
      <button
        onClick={onAbrirMenu}
        style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: `linear-gradient(135deg, ${CM.orange} 0%, #ff7a5e 100%)`,
          border: 'none', cursor: 'pointer', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 14, color: 'white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        {iniciales(nombre)}
        <HamburgerBadge />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nombre}
        </div>
      </div>

      {modo === 'mesa' && <MozoYMesa />}
    </header>
  )
}
