import type { CSSProperties } from 'react'

// El PNG del logo para fondos oscuros trae aire transparente alrededor de las letras. Acá se recorta para que `alto` sea
// el alto real de las letras y el logo no quede flotando dentro de su contenedor. Las medidas son píxeles del archivo
// (2172 × 724): si se reemplaza el PNG por otro con otras proporciones, hay que volver a medirlas.
const ARCHIVO = { ancho: 2172, alto: 724 }
const LETRAS = { x: 120, y: 165, ancho: 1932, alto: 380 }
// La "U" con el tenedor, a la derecha del todo.
const SOLO_U = { x: 1718, ancho: 334 }

interface LogoMenYuOscuroProps {
  /** Alto de las letras, en px. */
  alto: number
  /** Solo la "U" con el tenedor, para lugares angostos (por ejemplo, el menú lateral del admin cerrado). */
  soloU?: boolean
  /** Ruta de la imagen: cada app la sirve desde su carpeta `public`. */
  src?: string
  style?: CSSProperties
}

/** El logo de MenYu para fondos oscuros (`LogoParaOscuro.png`). Sobre fondo claro se usa el logo normal (`logo.png`). */
export function LogoMenYuOscuro({ alto, soloU = false, src = '/LogoParaOscuro.png', style }: LogoMenYuOscuroProps) {
  const escala = alto / LETRAS.alto
  const medida = (pixelesDelArchivo: number) => Math.round(pixelesDelArchivo * escala * 100) / 100
  const recorte = soloU ? SOLO_U : { x: LETRAS.x, ancho: LETRAS.ancho }

  return (
    <span
      style={{
        display: 'inline-block',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        width: medida(recorte.ancho),
        height: alto,
        ...style,
      }}
    >
      <img
        src={src}
        alt="MenYU"
        draggable={false}
        style={{
          position: 'absolute',
          left: -medida(recorte.x),
          top: -medida(LETRAS.y),
          width: medida(ARCHIVO.ancho),
          height: medida(ARCHIVO.alto),
          maxWidth: 'none',
          userSelect: 'none',
        }}
      />
    </span>
  )
}
