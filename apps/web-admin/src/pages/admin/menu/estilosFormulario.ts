import type { CSSProperties } from 'react'

/* Los campos del formulario del plato (ItemFormModal y sus bloques). */

export const labelSt: CSSProperties = {
  display:      'block',
  fontFamily:   'Inter, sans-serif',
  fontWeight:   500,
  fontSize:     13,
  color:        '#374151',
  marginBottom: 6,
}

export const inputSt: CSSProperties = {
  width:        '100%',
  boxSizing:    'border-box',
  border:       '1px solid #e5e7eb',
  borderRadius: 8,
  padding:      '8px 12px',
  fontFamily:   'Inter, sans-serif',
  fontSize:     13,
  color:        '#111827',
  outline:      'none',
  background:   'white',
}

/** Un chip que se prende y se apaga (dietas, etiquetas). */
export function chipSt(elegido: boolean): CSSProperties {
  return {
    background:   elegido ? '#2D3561' : 'white',
    color:        elegido ? 'white' : '#374151',
    border:       `1px solid ${elegido ? '#2D3561' : '#e5e7eb'}`,
    borderRadius: 999,
    padding:      '6px 14px',
    fontFamily:   'Inter, sans-serif',
    fontSize:     13,
    cursor:       'pointer',
    transition:   'all 150ms',
  }
}
