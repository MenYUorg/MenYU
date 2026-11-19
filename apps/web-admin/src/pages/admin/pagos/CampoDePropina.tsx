import { useId } from 'react'
import type { PropinaLeida } from '@menyu/ui/caja'

const C = {
  border: '#E6E8EF',
  white:  '#FFFFFF',
  text:   '#1F2333',
  red:    '#dc2626',
} as const

interface CampoDePropinaProps {
  valor: string
  /** Lo que dice parsearPropina de `valor`. */
  propina: PropinaLeida
  onChange: (valor: string) => void
}

/** La propina del cobro (#360): opcional, aparte del total de la mesa. Mismas reglas y textos que en web-staff. */
export function CampoDePropina({ valor, propina, onChange }: CampoDePropinaProps) {
  const id = useId()
  return (
    <>
      <label
        htmlFor={id}
        style={{ display: 'block', fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}
      >
        Propina (opcional)
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej. 500"
        aria-invalid={!propina.ok}
        aria-describedby={propina.ok ? undefined : `${id}-error`}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: `1px solid ${propina.ok ? C.border : C.red}`, fontFamily: 'Inter,sans-serif', fontSize: 13,
          color: C.text, background: C.white, outline: 'none',
          boxSizing: 'border-box', marginBottom: propina.ok ? 20 : 6,
        }}
      />
      {!propina.ok && (
        <p id={`${id}-error`} role="alert" style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.red, margin: '0 0 20px' }}>
          {propina.mensaje}
        </p>
      )}
    </>
  )
}
