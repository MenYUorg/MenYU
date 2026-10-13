import { DescuentoBadge } from './DescuentoBadge'
import { MenuItemImage } from './MenuItemImage'
import { PrecioConDescuento } from './PrecioConDescuento'
import { precioVigenteDe, tieneDescuento, type PrecioDePlato } from './precio'

interface ItemMenuFilaProps {
  item: PrecioDePlato & { nombre: string; imagenUrl: string | null }
  /** Qué pasa al tocar el botón +: abrir el plato para sumarlo a la comanda. */
  onAgregar: () => void
  /** Cómo se escribe un monto. Por defecto "$1500.00". */
  formatear?: (valor: number) => string
}

const formatearPorDefecto = (valor: number): string => `$${valor.toFixed(2)}`

/**
 * Fila de un plato en la toma de pedidos del personal (mozo y gerente): foto, nombre, precio y botón +.
 * Si el plato está en descuento muestra el círculo con el porcentaje en la foto y el precio original tachado.
 */
export function ItemMenuFila({ item, onAgregar, formatear = formatearPorDefecto }: ItemMenuFilaProps) {
  return (
    <div
      style={{
        background:   'white',
        border:       '1px solid #e5e7eb',
        borderRadius: 12,
        padding:      '14px 16px',
        display:      'flex',
        alignItems:   'center',
        gap:          16,
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <MenuItemImage src={item.imagenUrl} alt={item.nombre} width={56} height={56} borderRadius={8} />
        {tieneDescuento(item) && (
          <div style={{ position: 'absolute', top: -8, right: -8 }}>
            <DescuentoBadge porcentaje={item.porcentajeDescuento} tamano={30} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily:   'Inter,sans-serif',
            fontWeight:   600,
            fontSize:     15,
            color:        '#374151',
            margin:       0,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}
        >
          {item.nombre}
        </p>
        <div style={{ margin: '2px 0 0' }}>
          <PrecioConDescuento
            variante="fila"
            precioBase={Number(item.precioBase)}
            precioVigente={precioVigenteDe(item)}
            formatear={formatear}
            estilo={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#6b7280' }}
          />
        </div>
      </div>
      <button
        onClick={onAgregar}
        aria-label={`Agregar ${item.nombre}`}
        style={{
          width:          32,
          height:         32,
          borderRadius:   '50%',
          border:         'none',
          background:     '#E8563A',
          color:          'white',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          cursor:         'pointer',
          flexShrink:     0,
          fontSize:       22,
          fontWeight:     700,
          lineHeight:     1,
        }}
      >
        +
      </button>
    </div>
  )
}
