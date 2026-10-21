import { useLocation } from 'react-router-dom'
import { Clock, Store } from 'lucide-react'
import { Shell, type NavSection } from '../../components/shell/Shell'
import { useRootSession } from './useRootSession'

// Los grupos del diseño aprobado. "Dueños" y "Cuentas ROOT" se suman cuando estén las pantallas (esperan a la migración de
// autenticación): un enlace a una pantalla que no existe sería un callejón sin salida.
const SECCIONES: NavSection[] = [
  {
    label: 'ADMINISTRACIÓN',
    items: [{ to: '/root/marcas', label: 'Marcas', Icon: Store }],
  },
  {
    label: 'SISTEMA',
    items: [{ to: '/root/historial', label: 'Historial', Icon: Clock }],
  },
]

/** ROOT no opera ninguna marca ni restaurante: en vez del selector de web-admin, un cartel que lo dice. */
function ContextoDeRoot() {
  return (
    <div
      style={{
        background:   'rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding:      '10px 12px',
        margin:       '16px 0 8px',
      }}
    >
      <span
        style={{
          display:      'block',
          fontFamily:   'Montserrat, sans-serif',
          fontWeight:   700,
          fontSize:     16,
          color:        'white',
          marginBottom: 4,
        }}
      >
        Administración
      </span>
      <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
        Cuenta ROOT · sin acceso a los datos de las marcas
      </span>
    </div>
  )
}

/** El marco de la consola de ROOT: el mismo menú lateral y barra superior de web-admin, con el menú y los títulos de ROOT. */
export function RootLayout() {
  const { email, cerrarSesion } = useRootSession()
  const { pathname } = useLocation()
  const enHistorial = pathname.startsWith('/root/historial')

  return (
    <Shell
      secciones={SECCIONES}
      titulo={enHistorial ? 'Historial' : 'Marcas'}
      subtitulo={enHistorial ? 'Todo lo que hizo cada ROOT' : 'Marcas y restaurantes'}
      contexto={<ContextoDeRoot />}
      email={email}
      onCerrarSesion={cerrarSesion}
    />
  )
}
