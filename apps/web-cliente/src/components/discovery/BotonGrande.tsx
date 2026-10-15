import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { C } from '../../theme'
import { Icono, type NombreIcono } from './Icono'

interface BotonGrandeProps {
  /** `primario`: naranja, la acción principal. `secundario`: blanco con borde. */
  variante?: 'primario' | 'secundario'
  icono?: NombreIcono
  /** Con `to` es un link; sin él, un botón. */
  to?: string
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  children: ReactNode
}

/** Botón de ancho completo (52 px de alto, radio 14): el de "Escanear QR" y "Ingresar a una mesa". */
export function BotonGrande({ variante = 'primario', icono, to, onClick, disabled = false, type = 'button', children }: BotonGrandeProps) {
  const primario = variante === 'primario'
  const estilo = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    minHeight: 52,
    padding: '0 16px',
    borderRadius: 14,
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 700,
    fontSize: 16,
    textAlign: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? C.gray : primario ? C.orange : C.white,
    color: disabled ? C.white : primario ? C.white : C.navy,
    border: disabled ? `1.5px solid ${C.gray}` : primario ? 'none' : `1.5px solid ${C.borderInput}`,
  } as const
  const clases = disabled ? '' : primario ? 'hover:!bg-[#d34a30] transition-colors' : 'hover:!border-[#2D3561] transition-colors'
  const contenido = (
    <>
      {icono && <Icono nombre={icono} tam={20} grosor={primario ? 2.5 : 2.2} />}
      {children}
    </>
  )

  if (to && !disabled) {
    return <Link to={to} className={clases} style={estilo}>{contenido}</Link>
  }
  return <button type={type} onClick={onClick} disabled={disabled} className={clases} style={estilo}>{contenido}</button>
}
