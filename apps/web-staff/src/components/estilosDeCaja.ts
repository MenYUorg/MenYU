import type { CSSProperties } from 'react'

/** Paleta y estilos compartidos por las pantallas de caja (estilos inline, como el resto de web-staff). */
export const C = {
  navy:      '#2D3561',
  orange:    '#E8563A',
  orangeBg:  '#FDF0ED',
  white:     '#FFFFFF',
  border:    '#E6E8EF',
  textMut:   '#6B7280',
  textMuted: '#9CA3AF',
  textDark:  '#374151',
  green:     '#1F9D57',
  greenBg:   '#E4F6EC',
  red:       '#dc2626',
} as const

export const estiloBotonPrimario = (deshabilitado = false): CSSProperties => ({
  padding: '10px 22px', borderRadius: 10, border: 'none',
  background: deshabilitado ? '#d1d5db' : C.orange,
  color: deshabilitado ? '#9ca3af' : C.white,
  fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14,
  cursor: deshabilitado ? 'not-allowed' : 'pointer',
})

export const estiloBotonSecundario = (deshabilitado = false): CSSProperties => ({
  padding: '10px 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, color: C.textDark,
  fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 14,
  cursor: deshabilitado ? 'not-allowed' : 'pointer',
  opacity: deshabilitado ? 0.6 : 1,
})

export const estiloBotonContorno: CSSProperties = {
  padding: '9px 14px', borderRadius: 8, border: `1.5px solid ${C.navy}`, background: 'transparent', color: C.navy,
  fontFamily: 'Inter,sans-serif', fontSize: 13, cursor: 'pointer',
}

export const estiloErrorBanda: CSSProperties = {
  margin: 0, fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.red, background: '#fef2f2',
  border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px',
}

export const estiloCampo = (conError: boolean): CSSProperties => ({
  width: '100%', maxWidth: 360, padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
  border: `1px solid ${conError ? C.red : C.border}`,
  fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textDark, background: C.white,
})

export const estiloEtiqueta: CSSProperties = {
  display: 'block', fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: C.textDark, margin: '0 0 8px',
}

export const estiloErrorDeCampo: CSSProperties = { fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.red, margin: '4px 0 0' }

export const estiloCargandoPagina: CSSProperties = {
  margin: 0, fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMuted, textAlign: 'center', paddingTop: 48,
}

export const estiloTitulo: CSSProperties = { fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 15, color: C.navy, margin: 0 }
export const estiloTexto: CSSProperties = { fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, margin: 0 }

export const estiloAviso: CSSProperties = {
  margin: 0, background: C.orangeBg, border: `1px solid ${C.orange}`, borderRadius: 10, padding: '10px 14px',
  fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy,
}

export const estiloCelda = (encabezado: boolean): CSSProperties => ({
  textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.border}`,
  fontFamily: encabezado ? 'Montserrat,sans-serif' : 'Inter,sans-serif',
  fontWeight: encabezado ? 700 : 400, fontSize: encabezado ? 12 : 13,
  color: encabezado ? C.textMut : C.navy,
})

export const estiloTarjeta: CSSProperties = {
  background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
}
