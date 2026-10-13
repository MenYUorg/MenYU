interface DescuentoBadgeProps {
  /** Porcentaje entero de descuento (1 a 99), ya calculado por el backend. */
  porcentaje: number
  /** Diámetro del círculo en píxeles. */
  tamano?: number
}

/**
 * Círculo naranja con el porcentaje de descuento. Solo dibuja el círculo: quien lo usa lo posiciona
 * (por ejemplo, arriba a la derecha de la foto de un plato).
 */
export function DescuentoBadge({ porcentaje, tamano = 38 }: DescuentoBadgeProps) {
  return (
    <span
      role="img"
      aria-label={`${porcentaje}% de descuento`}
      style={{
        width:          tamano,
        height:         tamano,
        borderRadius:   '50%',
        background:     '#E8563A',
        color:          'white',
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'Montserrat, sans-serif',
        fontWeight:     800,
        fontSize:       Math.max(9, Math.round(tamano * 0.3)),
        lineHeight:     1,
        letterSpacing:  '-0.02em',
        boxShadow:      '0 2px 6px rgba(232,86,58,0.35)',
        flexShrink:     0,
        userSelect:     'none',
      }}
    >
      -{porcentaje}%
    </span>
  )
}
