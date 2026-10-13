import type { CSSProperties } from 'react'

export const C = {
  navy:   '#2D3561',
  navyBg: '#E5E7F0',
  orange: '#E8563A',
  border: '#e5e7eb',
  text:   '#111827',
  sub:    '#6b7280',
  muted:  '#9ca3af',
  red:    '#dc2626',
  green:  '#16a34a',
  bg:     '#f9fafb',
} as const

// Botones con altura mínima de 44px para que se puedan tocar bien desde el celular.
const botonBase: CSSProperties = {
  minHeight:      44,
  padding:        '0 16px',
  borderRadius:   10,
  fontFamily:     'Montserrat, sans-serif',
  fontWeight:     600,
  fontSize:       13,
  cursor:         'pointer',
  display:        'inline-flex',
  alignItems:     'center',
  justifyContent: 'center',
  gap:            6,
}

export const botonPrimario: CSSProperties = {
  ...botonBase,
  border:     'none',
  background: C.orange,
  color:      'white',
}

export const botonSecundario: CSSProperties = {
  ...botonBase,
  border:     `1px solid ${C.border}`,
  background: 'white',
  color:      '#374151',
}

export const botonPeligro: CSSProperties = {
  ...botonBase,
  border:     '1px solid #fecaca',
  background: 'white',
  color:      C.red,
}

export const botonPeligroSolido: CSSProperties = {
  ...botonBase,
  border:     'none',
  background: C.red,
  color:      'white',
}

/** Aplica el aspecto de botón deshabilitado. */
export function conEstado(estilo: CSSProperties, deshabilitado: boolean): CSSProperties {
  return deshabilitado ? { ...estilo, opacity: 0.55, cursor: 'not-allowed' } : estilo
}

export const tarjeta: CSSProperties = {
  background:   'white',
  border:       `1px solid ${C.border}`,
  borderRadius: 16,
  padding:      20,
}

export const tituloSeccion: CSSProperties = {
  fontFamily: 'Montserrat, sans-serif',
  fontWeight: 700,
  fontSize:   16,
  color:      C.navy,
  margin:     0,
}

export const textoAyuda: CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize:   12,
  color:      C.sub,
  margin:     0,
}
