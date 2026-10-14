import { Link } from 'react-router-dom'
import type { DiscoveryRestaurante } from '@menyu/types'
import { C } from '../../theme'
import { Icono } from './Icono'
import { LogoRestaurante } from './LogoRestaurante'

const DOS_LINEAS = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
} as const

/** Tarjeta de un restaurante (un link a su pantalla). Es la misma en la lista y en todos los grupos de la búsqueda. */
export function TarjetaRestaurante({ restaurante }: { restaurante: DiscoveryRestaurante }) {
  const { id, nombre, direccion, logoUrl, cantidadOfertas } = restaurante

  return (
    <Link
      to={`/restaurante/${id}`}
      className="flex min-h-[80px] min-w-0 items-center gap-3 rounded-xl border bg-white p-3 transition hover:border-[rgba(232,86,58,0.3)] hover:shadow-[0_4px_16px_rgba(232,86,58,0.1)]"
      style={{ borderColor: C.border }}
    >
      <LogoRestaurante nombre={nombre} logoUrl={logoUrl} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h3 style={{ ...DOS_LINEAS, margin: 0, fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, lineHeight: 1.25, color: C.text }}>
          {nombre}
        </h3>

        <p
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 5,
            fontFamily: 'Inter, sans-serif',
            fontSize: 12.5,
            lineHeight: 1.35,
            color: direccion ? C.textSub : C.gray,
            fontStyle: direccion ? 'normal' : 'italic',
          }}
        >
          <span style={{ marginTop: 2, display: 'flex' }}>
            <Icono nombre="pin" tam={13} />
          </span>
          <span style={DOS_LINEAS}>{direccion ?? 'Dirección no cargada'}</span>
        </p>

        {cantidadOfertas > 0 && (
          <span
            style={{
              alignSelf: 'flex-start',
              marginTop: 3,
              background: C.orangeSoft,
              color: C.orange,
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: 11,
              padding: '3px 9px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
            }}
          >
            {cantidadOfertas === 1 ? '1 oferta' : `${cantidadOfertas} ofertas`}
          </span>
        )}
      </div>

      <span style={{ flex: 'none', color: C.gray, display: 'flex' }}>
        <Icono nombre="derecha" tam={20} />
      </span>
    </Link>
  )
}
