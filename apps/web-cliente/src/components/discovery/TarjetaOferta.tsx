import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { DiscoveryOferta } from '@menyu/types'
import { DescuentoBadge, MenuItemImage, PrecioConDescuento } from '@menyu/ui'
import { C } from '../../theme'
import { formatearPrecio } from '../../utils/precio'

interface TarjetaOfertaProps {
  oferta: DiscoveryOferta
  /** En la pantalla de su propio restaurante no hace falta decir de cuál es. */
  sinRestaurante?: boolean
  /** Sin link: la tarjeta se ve pero no se toca (dentro de la pantalla del restaurante no hay a dónde ir). */
  fija?: boolean
}

const CLASES = 'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white transition'
const CLASES_CON_LINK = ' hover:border-[rgba(232,86,58,0.3)] hover:shadow-[0_4px_16px_rgba(232,86,58,0.1)]'

/**
 * Tarjeta de una oferta: la del menú (foto con el círculo del porcentaje, precio original tachado y precio con
 * descuento) con el restaurante debajo del nombre y sin el botón "+". Tocarla abre la pantalla del restaurante.
 */
export function TarjetaOferta({ oferta, sinRestaurante = false, fija = false }: TarjetaOfertaProps) {
  const contenido: ReactNode = (
    <>
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
        {!sinRestaurante && (
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
        )}
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
    </>
  )

  if (fija) {
    return <div className={CLASES} style={{ borderColor: C.border }}>{contenido}</div>
  }
  return (
    <Link to={`/restaurante/${oferta.restaurante.id}`} className={CLASES + CLASES_CON_LINK} style={{ borderColor: C.border }}>
      {contenido}
    </Link>
  )
}
