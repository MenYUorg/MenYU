import { Link } from 'react-router-dom'
import { C } from '../../theme'
import { Icono } from './Icono'

/** "← Volver" arriba de las pantallas de Discovery (44 px de alto para poder tocarlo). */
export function VolverEnlace({ to }: { to: string }) {
  return (
    <Link
      to={to}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 14, color: C.navy }}
    >
      <Icono nombre="izquierda" tam={18} /> Volver
    </Link>
  )
}
