import { Link } from 'react-router-dom'
import type { DiscoveryOferta } from '@menyu/types'
import { DescuentoBadge, MenuItemImage, PrecioConDescuento } from '@menyu/ui'
import { C } from '../../theme'
import { formatearPrecio } from '../../utils/precio'

/**
 * Tarjeta de una oferta: la del menú (foto con el círculo del porcentaje, precio original tachado y precio con
 * descuento) con el restaurante debajo del nombre y sin el botón "+". Tocarla abre la pantalla del restaurante.
 */
export function TarjetaOferta({ oferta }: { oferta: DiscoveryOferta }) {
  return (
    <Link
      to={`/restaurante/${oferta.restaurante.id}`}
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white transition hover:border-[rgba(232,86,58,0.3)] hover:shadow-[0_4px_16px_rgba(232,86,58,0.1)]"
      style={{ borderColor: C.border }}
    >
      <div style={{ position: 'relative', width: '100%', paddingBottom: '80%', overflow: 'hidden', flexShrink: 0, background: C.bg }}>
        <MenuItemImage src={oferta.imagenUrl} alt={oferta.nombre} className="absolute inset-0" />
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <DescuentoBadge porcentaje={oferta.porcentajeDescuento} />
        </div>
      </div>

      <div style={{ padding: '10px 11px 11px', display: 'flex', flexDirection: 'column', flex: 1, gap: 3, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.25,
            color: C.text,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {oferta.nombre}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            fontSize: 11,
            lineHeight: 1.3,
            color: C.textSub,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {oferta.restaurante.nombre}
        </p>
        <div style={{ marginTop: 'auto', paddingTop: 6 }}>
          <PrecioConDescuento
            variante="tarjeta"
            precioBase={oferta.precioBase}
            precioVigente={oferta.precioVigente}
            formatear={formatearPrecio}
            estilo={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: C.orange }}
          />
        </div>
      </div>
    </Link>
  )
}
