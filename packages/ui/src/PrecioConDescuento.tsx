import type { CSSProperties } from 'react'

type Variante = 'tarjeta' | 'fila' | 'detalle'

interface PrecioConDescuentoProps {
  /** Precio normal del plato. */
  precioBase: number
  /** Lo que se cobra por el plato (sin extras): el precio con descuento si lo tiene, si no el precio base. */
  precioVigente: number
  /** Cómo se escribe un monto. Cada app usa el suyo (web-cliente mantiene el actual; web-admin usa es-AR). */
  formatear: (valor: number) => string
  /**
   * Estilo del precio en el lugar donde se usa. Sin descuento se dibuja exactamente con este estilo, así que
   * los platos sin descuento se ven igual que antes. Con descuento, el precio vigente parte de este estilo.
   */
  estilo?: CSSProperties
  /** Cómo se acomodan el precio original y el vigente. */
  variante?: Variante
  /** Color del precio con descuento. */
  colorDescuento?: string
}

// Texto que solo leen los lectores de pantalla.
const soloLectores: CSSProperties = {
  position:   'absolute',
  width:      1,
  height:     1,
  padding:    0,
  margin:     -1,
  overflow:   'hidden',
  clip:       'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border:     0,
}

const CONTENEDOR: Record<Variante, CSSProperties> = {
  // En la tarjeta del menú, el original va arriba y chico, y el vigente abajo.
  tarjeta: { display: 'flex', flexDirection: 'column', lineHeight: 1.15 },
  fila: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 6px' },
  detalle: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 10px' },
}

const TAMANO_ORIGINAL: Record<Variante, number> = { tarjeta: 11, fila: 12, detalle: 15 }

/**
 * Precio de un plato. Con descuento muestra el precio original tachado y chico, y el precio vigente
 * en el color del descuento; sin descuento, solo el precio con el estilo del lugar donde se usa.
 */
export function PrecioConDescuento({
  precioBase,
  precioVigente,
  formatear,
  estilo,
  variante = 'fila',
  colorDescuento = '#E8563A',
}: PrecioConDescuentoProps) {
  const conDescuento = precioVigente < precioBase

  if (!conDescuento) {
    return <span style={estilo}>{formatear(precioVigente)}</span>
  }

  return (
    <span style={{ ...CONTENEDOR[variante], position: 'relative' }}>
      <span style={soloLectores}>Antes </span>
      <s
        style={{
          fontFamily:     'Inter, sans-serif',
          fontWeight:     400,
          fontSize:       TAMANO_ORIGINAL[variante],
          color:          '#9CA3AF',
          textDecoration: 'line-through',
        }}
      >
        {formatear(precioBase)}
      </s>
      <span style={soloLectores}>, ahora </span>
      <span style={{ ...estilo, color: colorDescuento, fontWeight: 700 }}>{formatear(precioVigente)}</span>
    </span>
  )
}
