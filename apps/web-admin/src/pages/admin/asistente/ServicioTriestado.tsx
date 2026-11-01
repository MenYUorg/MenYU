import { useId, type CSSProperties } from 'react'
import { C } from '../marca/estilos'

interface Props {
  /** Agrupa los tres radios (el `name` del input). */
  nombre:   string
  etiqueta: string
  /** true o false si el local lo declaró; null = sin dato. */
  valor:    boolean | null
  onChange: (valor: boolean | null) => void
  disabled?: boolean
}

const OPCIONES: { clave: string; valor: boolean | null; texto: string }[] = [
  { clave: 'sin-dato', valor: null,  texto: 'Sin dato' },
  { clave: 'si',       valor: true,  texto: 'Sí' },
  { clave: 'no',       valor: false, texto: 'No' },
]

function segmento(valor: boolean | null, elegida: boolean): CSSProperties {
  const base: CSSProperties = {
    minHeight:      40,
    minWidth:       56,
    padding:        '0 12px',
    borderRadius:   8,
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    fontFamily:     'Inter, sans-serif',
    fontSize:       13,
    border:         '1px solid transparent',
    transition:     'background 150ms, color 150ms',
    userSelect:     'none',
    whiteSpace:     'nowrap',
  }
  if (!elegida) return { ...base, color: C.sub, fontWeight: 500 }
  if (valor === null) {
    return { ...base, background: 'white', border: `1px dashed ${C.muted}`, color: '#374151', fontWeight: 600 }
  }
  return { ...base, background: C.navy, color: 'white', fontWeight: 600 }
}

/**
 * "Sin dato" no es "No": la respuesta declarada (Sí o No) va llena, en el azul de la marca; "Sin dato" queda como un
 * casillero vacío, con borde punteado. Son radios de verdad: se eligen con el teclado (flechas) y un lector de
 * pantalla anuncia el servicio y las tres opciones.
 */
export function ServicioTriestado({ nombre, etiqueta, valor, onChange, disabled }: Props) {
  const idEtiqueta = useId()

  return (
    <div
      role="radiogroup"
      aria-labelledby={idEtiqueta}
      aria-disabled={disabled || undefined}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
      style={{ padding: '10px 0', borderTop: `1px solid ${C.border}` }}
    >
      <span
        id={idEtiqueta}
        style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, color: C.text }}
      >
        {etiqueta}
      </span>

      <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 10, background: '#f3f4f6' }}>
        {OPCIONES.map((opcion) => {
          const elegida = valor === opcion.valor
          return (
            <label key={opcion.clave} style={{ display: 'inline-flex', cursor: disabled ? 'not-allowed' : 'pointer' }}>
              <input
                type="radio"
                name={nombre}
                value={opcion.clave}
                checked={elegida}
                disabled={disabled}
                onChange={() => onChange(opcion.valor)}
                className="peer sr-only"
              />
              <span
                className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#2D3561]"
                style={segmento(opcion.valor, elegida)}
              >
                {opcion.texto}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
