import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { C } from '../../theme'
import { Icono } from '../discovery/Icono'
import { InsigniaMesa } from '../PantallaComensal'

type EstadoMozo = 'reposo' | 'llamando' | 'avisado' | 'fallo'

const ETIQUETA_MOZO: Record<EstadoMozo, string> = {
  reposo: 'Llamar al mozo',
  llamando: 'Llamando…',
  avisado: '¡Ya avisamos! El mozo va en camino',
  fallo: 'No pudimos avisar. Probá de nuevo',
}

const BOTON: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 44,
  padding: '0 20px',
  borderRadius: 10,
  fontFamily: 'Montserrat, sans-serif',
  fontWeight: 700,
  fontSize: 14,
  textAlign: 'center',
  cursor: 'pointer',
}

const PRINCIPAL: CSSProperties = { ...BOTON, background: C.orange, color: C.white, border: '1.5px solid transparent' }
const CONTORNO: CSSProperties = { ...BOTON, background: C.white, color: C.navy, border: `1.5px solid ${C.borderInput}` }

/**
 * `/menu` de una mesa que ya estaba abierta cuando el restaurante (o su marca) se dio de baja: el menú responde 404, pero la
 * mesa se deja terminar (docs/plan-consola-root.md, sección 6). En vez de "No se pudo cargar el menú" (que no explica nada y
 * deja sin salida, porque el menú lateral y el botón del mozo viven en el menú), dice qué pasó y lleva a lo que sí se puede
 * hacer: ver lo pedido, pagar y llamar al mozo para pedir la cuenta.
 */
export function MesaSinCarta() {
  const navigate = useNavigate()
  const sesionId = useSessionStore((s) => s.sesionId)
  const jwt = useSessionStore((s) => s.jwt)
  const numeroMesa = useSessionStore((s) => s.numeroMesa)
  const [mozo, setMozo] = useState<EstadoMozo>('reposo')
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  const llamarAlMozo = async () => {
    if (mozo !== 'reposo' || !sesionId || !jwt) return
    setMozo('llamando')
    try {
      await api.waiterCalls.llamar(sesionId, jwt)
      setMozo('avisado')
    } catch {
      setMozo('fallo')
    }
    temporizador.current = setTimeout(() => setMozo('reposo'), 4000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh', background: C.bg }}>
      <header style={{ background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', gap: 12 }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 17, color: C.white }}>Tu mesa</span>
        {numeroMesa && <InsigniaMesa numero={numeroMesa} />}
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 428, margin: '0 auto', boxSizing: 'border-box', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div aria-hidden="true" style={{ width: 72, height: 72, borderRadius: '50%', background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icono nombre="local" tam={32} trazo={C.orange} />
        </div>

        <div role="status">
          <h1 style={{ margin: 0, fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 18, lineHeight: 1.25, color: C.navy, overflowWrap: 'anywhere' }}>
            Este restaurante ya no está disponible
          </h1>
          <p style={{ margin: '8px 0 0', fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: 1.5, color: C.textSub }}>
            No podemos mostrarte su carta, pero tu mesa sigue abierta: todavía podés ver lo que pediste y pagar la cuenta.
          </p>
        </div>

        <section aria-labelledby="como-pedir-la-cuenta" style={{ width: '100%', boxSizing: 'border-box', background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', textAlign: 'left' }}>
          <h2 id="como-pedir-la-cuenta" style={{ margin: 0, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.navy }}>
            Cómo pedir la cuenta
          </h2>
          {/* `listStyle` explícito: Tailwind borra las viñetas de las listas. */}
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, listStyle: 'disc', fontFamily: 'Inter, sans-serif', fontSize: 13.5, lineHeight: 1.5, color: C.text }}>
            <li>Tocá «Pagar la cuenta» y elegí Mercado Pago o efectivo. Con efectivo, el mozo te la cobra en la mesa.</li>
            <li style={{ marginTop: 6 }}>O tocá «Llamar al mozo» y pedísela.</li>
          </ul>
        </section>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" style={PRINCIPAL} onClick={() => navigate('/pagar')}>Pagar la cuenta</button>
          <button type="button" style={CONTORNO} onClick={() => navigate('/pedidos')}>Ver mis pedidos</button>
          {sesionId && jwt && (
            <button type="button" style={CONTORNO} onClick={() => void llamarAlMozo()} disabled={mozo === 'llamando'} aria-live="polite">
              {ETIQUETA_MOZO[mozo]}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
