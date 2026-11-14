import { CM } from './paleta'

export interface SeccionMenu {
  id: string
  nombre: string
}

interface ChipsSeccionesProps {
  secciones: SeccionMenu[]
  /** El id de la sección que se está viendo. */
  activa: string
  onElegir: (id: string) => void
}

/**
 * Los botones de las secciones (Descuentos, recomendaciones y categorías): tocarlos lleva a la sección (y, en MenuView,
 * el foco al encabezado de esa sección). Es una navegación con nombre ("Secciones del menú") y el chip de la sección que
 * se está viendo dice `aria-current` ("actual").
 */
export function ChipsSecciones({ secciones, activa, onElegir }: ChipsSeccionesProps) {
  return (
    <nav aria-label="Secciones del menú" style={{ background: 'white', borderBottom: `1px solid ${CM.border}`, flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
      <div style={{ display: 'flex', padding: '8px 14px', gap: 6, width: 'max-content' }}>
        {secciones.map((sec) => {
          const active = activa === sec.id
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => onElegir(sec.id)}
              aria-current={active ? 'true' : undefined}
              style={{
                padding: '6px 14px', borderRadius: 999,
                background: active ? CM.navy : 'white',
                color: active ? 'white' : CM.navy,
                border: `1px solid ${active ? CM.navy : CM.border}`,
                fontFamily: 'Inter,sans-serif', fontWeight: 500, fontSize: 13,
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
              }}
            >
              {sec.nombre}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
