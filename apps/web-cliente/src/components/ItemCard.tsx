import type { MenuPublicoItem } from '@menyu/types'
import { DescuentoBadge, MenuItemImage, PrecioConDescuento } from '@menyu/ui'
import { formatearPrecio, precioVigenteDe, tieneDescuento } from '../utils/precio'

const C = {
  orange:    '#E8563A',
  text:      '#1A1A2E',
  textSub:   '#6B7280',
  border:    '#ECECEE',
} as const

/**
 * Tarjeta de un plato en la grilla del menú. Si está en descuento muestra el círculo con el porcentaje y los dos precios.
 * Con `onPress` se toca (y tiene el botón "+"); sin él es de solo lectura, como en la carta en modo vista.
 */
export function ItemCard({ item, onPress }: { item: MenuPublicoItem; onPress?: () => void }) {
  const enDescuento = tieneDescuento(item)

  return (
    <div
      onClick={onPress}
      className="group"
      style={{
        background: 'white', borderRadius: 12, border: `1px solid ${C.border}`,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        cursor: onPress ? 'pointer' : 'default', transition: 'border-color .15s, box-shadow .15s',
      }}
      onMouseEnter={onPress ? (e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = 'rgba(232,86,58,0.3)'
        el.style.boxShadow = '0 4px 16px rgba(232,86,58,0.1)'
      } : undefined}
      onMouseLeave={onPress ? (e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = C.border
        el.style.boxShadow = 'none'
      } : undefined}
    >
      <div style={{ position: 'relative', width: '100%', paddingBottom: '80%', overflow: 'hidden', flexShrink: 0 }}>
        <MenuItemImage
          src={item.imagenUrl}
          alt={item.nombre}
          className="absolute inset-0"
        />
        {enDescuento && (
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <DescuentoBadge porcentaje={item.porcentajeDescuento} />
          </div>
        )}
      </div>
      <div style={{ padding: '10px 11px 11px', display: 'flex', flexDirection: 'column', flex: 1, gap: 3 }}>
        <p style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.text, lineHeight: 1.25, margin: 0 }}>
          {item.nombre}
        </p>
        {item.descripcion && (
          <p style={{
            fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.textSub,
            lineHeight: 1.35, margin: 0,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.descripcion}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <PrecioConDescuento
            variante="tarjeta"
            precioBase={Number(item.precioBase)}
            precioVigente={precioVigenteDe(item)}
            formatear={formatearPrecio}
            estilo={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.orange }}
          />
          {onPress && (
            <button
              onClick={(e) => { e.stopPropagation(); onPress() }}
              aria-label={`Agregar ${item.nombre}`}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: C.orange, color: 'white', border: 'none',
                fontSize: 18, lineHeight: 1, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(232,86,58,0.35)',
                cursor: 'pointer', flexShrink: 0,
              }}
            >+</button>
          )}
        </div>
      </div>
    </div>
  )
}
