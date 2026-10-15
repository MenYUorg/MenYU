import { useState } from 'react'
import { C } from '../../theme'
import { iniciales } from '../../utils/iniciales'

interface LogoRestauranteProps {
  nombre: string
  /** El del restaurante o, si no tiene, el de su marca. `null` si ninguno de los dos tiene. */
  logoUrl: string | null
  /** Lado del cuadrado, en px. */
  tamano?: number
}

/**
 * Logo del restaurante en un cuadrado blanco: entra entero, sin recortarse ni deformarse (sea ancho, alto o redondo).
 * Sin logo, o si la imagen no carga, muestra las iniciales sobre el naranja suave.
 */
export function LogoRestaurante({ nombre, logoUrl, tamano = 56 }: LogoRestauranteProps) {
  const [fallo, setFallo] = useState(false)
  const conLogo = !!logoUrl && !fallo
  const radio = tamano >= 96 ? 20 : tamano <= 40 ? 10 : 12

  return (
    <span
      style={{
        width: tamano,
        height: tamano,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: radio,
        boxSizing: 'border-box',
        background: conLogo ? C.white : C.orangeSoft,
        border: `1px solid ${conLogo ? C.border : C.orangeSoft}`,
        color: C.orange,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 800,
        fontSize: tamano * 0.34,
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}
    >
      {conLogo ? (
        <img
          src={logoUrl}
          alt=""
          onError={() => setFallo(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: tamano * 0.1, boxSizing: 'border-box', display: 'block' }}
        />
      ) : (
        <span aria-hidden="true">{iniciales(nombre)}</span>
      )}
    </span>
  )
}
