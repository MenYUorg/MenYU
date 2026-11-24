import type { CSSProperties } from 'react'
import { C } from '../marca/estilos'

// Estilos compartidos de las pantallas de caja (Cajas y Turnos), con la paleta de la app.

export const tituloPagina: CSSProperties = { fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 22, color: C.navy, margin: 0, lineHeight: 1.2 }
export const subtituloPagina: CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.muted, margin: '4px 0 0' }
export const tarjetaDeLista: CSSProperties = { background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }
export const bloqueInterno: CSSProperties = { background: C.bg, borderRadius: 10, padding: '10px 14px', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }
export const textoCentrado: CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.muted, textAlign: 'center', padding: '48px 0', margin: 0 }
export const bannerError: CSSProperties = { padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.red }
const pastilla: CSSProperties = { display: 'inline-flex', alignItems: 'center', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 10, padding: '2px 8px', borderRadius: 999, flexShrink: 0 }
export const pastillaNeutra: CSSProperties = { ...pastilla, background: '#f3f4f6', color: C.sub }
export const pastillaMarca: CSSProperties = { ...pastilla, background: C.navyBg, color: C.navy }
export const pastillaExito: CSSProperties = { ...pastilla, background: '#dcfce7', color: C.green }
export const enlace: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, color: C.navy, textDecoration: 'none', alignSelf: 'flex-start' }
export const volver: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.sub, textDecoration: 'none', alignSelf: 'flex-start' }
