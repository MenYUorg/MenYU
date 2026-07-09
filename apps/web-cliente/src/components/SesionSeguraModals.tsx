import { useState } from 'react'

const C = {
  orange: '#E8563A',
  orangeSoft: '#FDE5DF',
  navy: '#2D3561',
  textSub: '#6B7280',
  border: '#ECECEE',
} as const

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, background: `linear-gradient(135deg, ${C.navy} 0%, #1e254a 100%)`,
    }}>
      <div style={{ width: '100%', maxWidth: 360, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
        <div style={{ background: C.navy, padding: '28px 32px 20px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, marginBottom: 8 }}>
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 26, color: 'white', letterSpacing: '-0.01em' }}>
              MENY
            </span>
            <div style={{ width: 14, height: 17, background: C.orange, marginBottom: 3, borderRadius: '3px 3px 50% 50% / 3px 3px 30% 30%' }} />
          </div>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
            Abriendo tu mesa…
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}

export function AnfitrionScreen({ codigo, onContinuar }: { codigo: string | null; onContinuar: () => void }) {
  return (
    <Shell>
      <div style={{ background: 'white', padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.orange, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 24, color: 'white', fontWeight: 'bold' }}>✓</span>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 18, color: C.navy, margin: '0 0 8px' }}>
            ¡Sos el anfitrión de la mesa!
          </p>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: 0 }}>
            Compartí este código con tus acompañantes para que puedan unirse:
          </p>
        </div>
        <div style={{ width: '100%', boxSizing: 'border-box', border: `2px solid ${C.navy}`, borderRadius: 16, background: '#E5E7F0', padding: '20px 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 48, color: C.navy, margin: '0 0 4px', letterSpacing: '0.1em' }}>
            {codigo ?? '—'}
          </p>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textSub, margin: 0 }}>
            Código de mesa
          </p>
        </div>
        <button
          onClick={onContinuar}
          style={{ width: '100%', background: C.orange, color: 'white', border: 'none', borderRadius: 10, padding: '13px 20px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Ver el menú
        </button>
      </div>
    </Shell>
  )
}

interface CodigoSesionScreenProps {
  loading: boolean
  error: string | null
  onSubmit: (codigo: string) => void
  onVolver: () => void
}

export function CodigoSesionScreen({ loading, error, onSubmit, onVolver }: CodigoSesionScreenProps) {
  const [codigo, setCodigo] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(codigo)
  }

  return (
    <Shell>
      <form
        onSubmit={handleSubmit}
        style={{ background: 'white', padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
      >
        <span style={{ fontSize: 48 }}>🔒</span>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 20, color: C.navy, margin: '0 0 8px' }}>
            Mesa en modo seguro
          </p>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textSub, margin: 0 }}>
            El anfitrión de la mesa tiene un código de 3 dígitos. Pedíselo para unirte.
          </p>
        </div>
        <input
          type="text"
          inputMode="numeric"
          maxLength={3}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="000"
          style={{
            width: 120, height: 64, textAlign: 'center',
            fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 32, letterSpacing: '0.3em',
            border: `2px solid ${C.border}`, borderRadius: 12, outline: 'none', color: C.navy, boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.target.style.borderColor = C.orange }}
          onBlur={(e) => { e.target.style.borderColor = C.border }}
        />
        {error && (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.orange, background: C.orangeSoft, borderRadius: 8, padding: '9px 12px', margin: 0, width: '100%', boxSizing: 'border-box' }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || codigo.length !== 3}
          style={{ width: '100%', background: C.orange, color: 'white', border: 'none', borderRadius: 10, padding: '13px 20px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer', opacity: loading || codigo.length !== 3 ? 0.5 : 1, transition: 'opacity .15s' }}
        >
          {loading ? 'Uniéndome…' : 'Unirme a la mesa'}
        </button>
        <button
          type="button"
          onClick={onVolver}
          style={{ background: 'none', border: 'none', fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.textSub, cursor: 'pointer', padding: '4px 0' }}
        >
          ← Volver
        </button>
      </form>
    </Shell>
  )
}
