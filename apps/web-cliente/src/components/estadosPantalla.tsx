import { Spinner } from '@menyu/ui'
import { C } from '../theme'

// Los estados son funciones que devuelven el elemento, no componentes: así el <div> queda en la misma
// posición del árbol que antes y React lo reutiliza al pasar de un estado a otro (por ejemplo, de
// "cargando" a "error"), igual que cuando cada pantalla los escribía a mano.

const CENTRADO = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' } as const

export function estadoCargando() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size="md" />
    </div>
  )
}

export function estadoError(mensaje: string, onReintentar: () => void) {
  return (
    <div style={CENTRADO}>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#DC2626', margin: 0 }}>{mensaje}</p>
      <button
        onClick={onReintentar}
        style={{
          background: C.orange, color: 'white', border: 'none',
          borderRadius: 10, padding: '10px 20px',
          fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
    </div>
  )
}

/** "No hay nada que mostrar": un emoji opcional, el texto y un botón para seguir. */
export function estadoVacio({
  emoji,
  texto,
  accion,
  separarAccion = false,
}: {
  emoji?: string
  texto: string
  accion: { texto: string; onClick: () => void }
  /** Un poco más de aire entre el texto y el botón. */
  separarAccion?: boolean
}) {
  const parrafo = (
    <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 15, color: C.text, margin: 0 }}>
      {texto}
    </p>
  )
  const boton = (
    <button
      onClick={accion.onClick}
      style={{
        background: C.orange, color: 'white', border: 'none',
        borderRadius: 12, padding: '12px 24px',
        fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14,
        cursor: 'pointer', marginTop: separarAccion ? 8 : undefined,
      }}
    >
      {accion.texto}
    </button>
  )
  // Sin emoji, el texto y el botón son el primer y el segundo hijo, como en las pantallas que no lo tenían.
  return emoji ? (
    <div style={CENTRADO}>
      <p style={{ fontSize: 52, margin: 0 }}>{emoji}</p>
      {parrafo}
      {boton}
    </div>
  ) : (
    <div style={CENTRADO}>
      {parrafo}
      {boton}
    </div>
  )
}