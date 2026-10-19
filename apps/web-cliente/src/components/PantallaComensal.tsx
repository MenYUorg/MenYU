import type { ReactNode } from 'react'
import { C } from '../theme'

// La estructura que comparten las pantallas del comensal con barra azul: carrito, mis pedidos, etiquetar,
// pagar, cuántos son y armar mensaje. Encabezado con "volver" y título centrado, y una columna blanca
// centrada. Los estados de carga, error y "no hay nada" están en estadosPantalla.tsx.

/** Barra azul de arriba: flecha para volver, título centrado y, a la derecha, un espacio o lo que se pase. */
export function EncabezadoPantalla({
  titulo,
  onVolver,
  etiquetaVolver,
  derecha,
}: {
  titulo: string
  onVolver: () => void
  /** El `aria-label` de la flecha (p. ej. "Volver al menú"). */
  etiquetaVolver: string
  /** Lo que va a la derecha del título; sin valor, un espacio del ancho de la flecha para centrarlo. */
  derecha?: ReactNode
}) {
  return (
    <header style={{
      background: C.navy,
      display:    'flex',
      alignItems: 'center',
      padding:    '14px 16px',
      gap:        12,
      flexShrink: 0,
    }}>
      <button
        onClick={onVolver}
        style={{
          background: 'none',
          border:     'none',
          cursor:     'pointer',
          color:      'white',
          fontSize:   22,
          lineHeight: 1,
          padding:    '2px 8px 2px 0',
          display:    'flex',
          alignItems: 'center',
        }}
        aria-label={etiquetaVolver}
      >
        ←
      </button>
      <span style={{
        flex:       1,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700,
        fontSize:   17,
        color:      'white',
        textAlign:  'center',
      }}>
        {titulo}
      </span>
      {derecha ?? <div style={{ width: 38 }} />}
    </header>
  )
}

/** La insignia "Mesa N" que algunas pantallas ponen a la derecha del encabezado. */
export function InsigniaMesa({ numero }: { numero: number | string | null | undefined }) {
  return (
    <span style={{
      background:   C.orange,
      color:        'white',
      fontFamily:   'Inter, sans-serif',
      fontWeight:   600,
      fontSize:     12,
      padding:      '4px 10px',
      borderRadius: 20,
      whiteSpace:   'nowrap',
    }}>
      Mesa {numero ?? ''}
    </span>
  )
}

/** Fondo gris de toda la pantalla y la columna blanca centrada, con el encabezado arriba. */
export function MarcoPantalla({
  ancho,
  encabezado,
  children,
}: {
  /** Ancho máximo de la columna en px. */
  ancho: number
  encabezado: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg }}>
      <div style={{
        maxWidth:      ancho,
        width:         '100%',
        margin:        '0 auto',
        background:    'white',
        minHeight:     '100vh',
        display:       'flex',
        flexDirection: 'column',
      }}>
        {encabezado}
        {children}
      </div>
    </div>
  )
}
