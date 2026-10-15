import type { ItemMenu } from '@menyu/types'
import { MenuItemImage } from '@menyu/ui'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { formatearPesos } from '../../../utils/descuento'
import { ToggleSwitch } from './ToggleSwitch'

interface ItemRowProps {
  item: ItemMenu
  /** Valor a mostrar de "Disponible" (puede ser el optimista mientras se guarda). */
  disponible: boolean
  recomendado: boolean
  /** Solo el OWNER y el GERENTE ponen descuentos: ROOT no ve el botón. */
  puedeGestionarDescuento: boolean
  onEditar: () => void
  onDescuento: () => void
  onToggleDisponible: () => void
  onToggleRecomendado: () => void
}

const boton: React.CSSProperties = {
  background:   'white',
  color:        '#374151',
  border:       '1px solid #e5e7eb',
  borderRadius: 8,
  cursor:       'pointer',
  fontFamily:   'Inter, sans-serif',
  fontSize:     13,
  transition:   'border-color 150ms, color 150ms',
}

export function ItemRow({
  item,
  disponible,
  recomendado,
  puedeGestionarDescuento,
  onEditar,
  onDescuento,
  onToggleDisponible,
  onToggleRecomendado,
}: ItemRowProps) {
  const esEscritorio = useMediaQuery('(min-width: 768px)')
  const conDescuento = item.precioDescuento != null && item.porcentajeDescuento != null

  // En celular los botones y los interruptores miden al menos 44px para poder tocarlos.
  const altoBoton = esEscritorio ? undefined : 44
  const estiloBoton: React.CSSProperties = {
    ...boton,
    padding:  '6px 14px',
    minHeight: altoBoton,
    flex:     esEscritorio ? undefined : 1,
  }
  const estiloDescuentoActivo: React.CSSProperties = conDescuento
    ? { background: '#FDE5DF', color: '#E8563A', borderColor: '#E8563A', fontWeight: 600 }
    : {}

  return (
    <div
      style={{
        background:   recomendado ? '#FDE5DF' : 'white',
        border:       recomendado ? '2px solid #E8563A' : '1px solid #e5e7eb',
        borderRadius: 12,
        padding:      esEscritorio ? '12px 16px' : 12,
        display:      'flex',
        flexDirection: esEscritorio ? 'row' : 'column',
        alignItems:   esEscritorio ? 'center' : 'stretch',
        gap:          esEscritorio ? 16 : 12,
        opacity:      disponible ? 1 : 0.55,
        transition:   'opacity 200ms, background 200ms, border-color 200ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: esEscritorio ? 16 : 12, flex: 1, minWidth: 0 }}>
        <MenuItemImage
          src={item.imagenUrl}
          alt={item.nombre}
          width={esEscritorio ? 64 : 56}
          height={esEscritorio ? 64 : 56}
          borderRadius={10}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontFamily:   'Inter, sans-serif',
              fontWeight:   600,
              fontSize:     15,
              color:        '#111827',
              margin:       '0 0 3px',
              whiteSpace:   'nowrap',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.nombre}
          </p>
          <p
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize:   13,
              color:      '#6b7280',
              margin:     0,
              display:    'flex',
              alignItems: 'center',
              flexWrap:   'wrap',
              gap:        '2px 8px',
            }}
          >
            {conDescuento ? (
              <>
                <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                  {formatearPesos(Number(item.precioBase))}
                </span>
                <strong style={{ color: '#E8563A', fontWeight: 700 }}>{formatearPesos(Number(item.precioDescuento))}</strong>
                <span
                  style={{
                    background:   '#E8563A',
                    color:        'white',
                    borderRadius: 999,
                    padding:      '1px 8px',
                    fontFamily:   'Montserrat, sans-serif',
                    fontWeight:   700,
                    fontSize:     11,
                  }}
                >
                  -{item.porcentajeDescuento}%
                </span>
              </>
            ) : (
              <span>{formatearPesos(Number(item.precioBase))}</span>
            )}
            {!disponible && <span style={{ color: '#dc2626' }}>· Sin stock</span>}
          </p>
        </div>
      </div>

      <div
        style={{
          display:       'flex',
          flexDirection: esEscritorio ? 'row' : 'column',
          alignItems:    esEscritorio ? 'center' : 'stretch',
          gap:           esEscritorio ? 12 : 8,
          flexShrink:    0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={onEditar}
            style={estiloBoton}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement
              b.style.borderColor = '#2D3561'
              b.style.color = '#2D3561'
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement
              b.style.borderColor = '#e5e7eb'
              b.style.color = '#374151'
            }}
          >
            Editar
          </button>
          {puedeGestionarDescuento && (
            <button
              type="button"
              onClick={onDescuento}
              aria-label={`Descuento de ${item.nombre}`}
              style={{ ...estiloBoton, ...estiloDescuentoActivo }}
            >
              Descuento
            </button>
          )}
        </div>

        <div
          style={{
            display:       'flex',
            flexDirection: esEscritorio ? 'column' : 'row',
            flexWrap:      'wrap',
            gap:           esEscritorio ? 8 : '0 20px',
          }}
        >
          <ToggleSwitch
            rotulo="Disponible"
            anchoRotulo={esEscritorio ? 76 : undefined}
            altoMinimo={esEscritorio ? 24 : 44}
            value={disponible}
            onChange={onToggleDisponible}
            title="Disponible para el cliente"
          />
          <ToggleSwitch
            rotulo="Recomendado"
            anchoRotulo={esEscritorio ? 76 : undefined}
            altoMinimo={esEscritorio ? 24 : 44}
            value={recomendado}
            onChange={onToggleRecomendado}
            title="Recomendado por el chef"
            disabled={!disponible}
          />
        </div>
      </div>
    </div>
  )
}
