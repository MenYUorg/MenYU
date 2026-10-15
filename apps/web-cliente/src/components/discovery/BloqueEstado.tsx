import { C } from '../../theme'
import { Icono, type NombreIcono } from './Icono'

interface BloqueEstadoProps {
  icono: NombreIcono
  titulo: string
  texto: string
  /** Texto del botón; sin él no hay botón. */
  boton?: string
  onBoton?: () => void
  /** Botón blanco con borde (acción secundaria) en lugar del naranja. */
  contorno?: boolean
  /** `alert` para errores; `status` para lo demás. */
  rol?: 'alert' | 'status'
}

/** Bloque centrado para un error, un vacío o "sin resultados": ícono, título, explicación y, si hace falta, un botón. */
export function BloqueEstado({ icono, titulo, texto, boton, onBoton, contorno = false, rol = 'status' }: BloqueEstadoProps) {
  return (
    <div
      role={rol}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px 32px', gap: 8 }}
    >
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.orangeSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Icono nombre={icono} tam={32} trazo={C.orange} />
      </div>
      <h2 style={{ margin: 0, fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em', color: C.navy, overflowWrap: 'anywhere' }}>
        {titulo}
      </h2>
      <p style={{ margin: 0, maxWidth: 320, fontFamily: 'Inter, sans-serif', fontSize: 14, lineHeight: 1.5, color: C.textSub, overflowWrap: 'anywhere' }}>
        {texto}
      </p>
      {boton && (
        <button
          type="button"
          onClick={onBoton}
          style={{
            marginTop: 12,
            minHeight: 44,
            padding: '0 20px',
            borderRadius: 10,
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            background: contorno ? C.white : C.orange,
            color: contorno ? C.navy : C.white,
            border: contorno ? `1.5px solid ${C.borderInput}` : 'none',
          }}
        >
          {boton}
        </button>
      )}
    </div>
  )
}
