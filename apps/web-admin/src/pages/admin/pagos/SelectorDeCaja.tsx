import { useId } from 'react'
import type { CajaAbierta } from '@menyu/types'

const C = {
  orange:     '#E8563A',
  orangeSoft: '#FDF0ED',
  border:     '#E6E8EF',
  white:      '#FFFFFF',
  text:       '#1F2333',
  red:        '#dc2626',
} as const

interface SelectorDeCajaProps {
  /** Las cajas abiertas del turno (dos o más: con una no se elige). */
  cajas: CajaAbierta[]
  /** La caja elegida que sigue abierta, o ninguna. */
  elegida: string | undefined
  /** Falta elegir: el cobro no se puede confirmar. */
  falta: boolean
  onElegir: (cajaId: string) => void
}

/**
 * En qué caja se cobra, con dos o más cajas abiertas (#360). Radios nativos sin ninguno elegido de antemano, como en el
 * cobro de web-staff; en web-admin la caja no se recuerda entre cobros.
 */
export function SelectorDeCaja({ cajas, elegida, falta, onElegir }: SelectorDeCajaProps) {
  const id = useId()
  return (
    <div style={{ marginBottom: 20 }}>
      <p id={id} style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
        Caja
      </p>
      <div role="radiogroup" aria-labelledby={id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {cajas.map((c) => {
          const sel = elegida === c.cajaId
          return (
            <label
              key={c.cajaId}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 8,
                border: `1.5px solid ${sel ? C.orange : C.border}`,
                background: sel ? C.orangeSoft : C.white,
                color: sel ? C.orange : C.text,
                fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: sel ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name={id}
                value={c.cajaId}
                checked={sel}
                onChange={() => onElegir(c.cajaId)}
                style={{ accentColor: C.orange, margin: 0 }}
              />
              {c.nombre}
            </label>
          )
        })}
      </div>
      {falta && (
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.red, margin: '8px 0 0' }}>
          Elegí en qué caja se cobra
        </p>
      )}
    </div>
  )
}
