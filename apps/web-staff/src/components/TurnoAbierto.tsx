import type { TurnoDeCaja } from '@menyu/types'
import { formatearFechaHora } from '../utils/formato'

const C = {
  navy:    '#2D3561',
  white:   '#FFFFFF',
  border:  '#E6E8EF',
  textMut: '#6B7280',
  green:   '#1F9D57',
  greenBg: '#E8F6EE',
} as const

interface TurnoAbiertoProps {
  turno: TurnoDeCaja
}

/** El turno abierto del restaurante (#359): desde cuándo y quién lo abrió. */
export function TurnoAbierto({ turno }: TurnoAbiertoProps) {
  return (
    <section
      aria-label="Turno abierto"
      style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <span style={{
        alignSelf: 'flex-start', background: C.greenBg, color: C.green, borderRadius: 20, padding: '3px 10px',
        fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12,
      }}>
        Turno abierto
      </span>
      <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut, margin: 0 }}>
        Desde {formatearFechaHora(turno.abiertoEn)} · abrió {turno.abiertoPor.nombre}
      </p>
    </section>
  )
}
