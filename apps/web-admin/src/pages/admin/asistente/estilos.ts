import type { CSSProperties } from 'react'
import { C, textoAyuda } from '../marca/estilos'

// Los campos de la pantalla del asistente, iguales a los de Marca y sucursales (DireccionField): 44 px de alto y
// letra de 16 px, para que iOS no haga zoom al enfocarlos.

export const etiquetaCampo: CSSProperties = {
  display:      'block',
  fontFamily:   'Montserrat, sans-serif',
  fontWeight:   600,
  fontSize:     13,
  color:        C.navy,
  marginBottom: 8,
}

export const campo: CSSProperties = {
  width:        '100%',
  boxSizing:    'border-box',
  minHeight:    44,
  padding:      '0 12px',
  borderRadius: 10,
  border:       `1px solid ${C.border}`,
  fontFamily:   'Inter, sans-serif',
  fontSize:     16,
  color:        C.text,
  background:   'white',
}

export const areaDeTexto: CSSProperties = {
  ...campo,
  padding:    '10px 12px',
  lineHeight: 1.5,
  resize:     'vertical',
}

export const contador: CSSProperties = {
  ...textoAyuda,
  color:     C.muted,
  marginTop: 4,
  textAlign: 'right',
}

export const mensajeDeFalla: CSSProperties = { ...textoAyuda, color: C.red, fontSize: 13 }
export const mensajeDeExito: CSSProperties = { ...textoAyuda, color: C.green, fontSize: 13 }
