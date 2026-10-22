import { useLocation } from 'react-router-dom'
import { Clock, Shield, Store, Users } from 'lucide-react'
import { Shell, type NavSection } from '../../components/shell/Shell'
import { useRootSession } from './useRootSession'

// Los grupos del diseño aprobado.
const SECCIONES: NavSection[] = [
  {
    label: 'ADMINISTRACIÓN',
    items: [
      { to: '/root/marcas', label: 'Marcas', Icon: Store },
      { to: '/root/duenos', label: 'Dueños', Icon: Users },
    ],
  },
  {
    label: 'SISTEMA',
    items: [
      { to: '/root/roots', label: 'Cuentas ROOT', Icon: Shield },
      { to: '/root/historial', label: 'Historial', Icon: Clock },
    ],
  },
]

/** El título y el subtítulo de la barra de arriba, según la pantalla. Marcas (y el detalle de una marca) es la de por defecto. */
function encabezadoDe(pathname: string): { titulo: string; subtitulo: string } {
  if (pathname.startsWith('/root/historial')) return { titulo: 'Historial', subtitulo: 'Todo lo que hizo cada ROOT' }
  if (pathname.startsWith('/root/duenos')) return { titulo: 'Dueños', subtitulo: 'Cuentas de dueño (OWNER)' }
  if (pathname.startsWith('/root/roots')) return { titulo: 'Cuentas ROOT', subtitulo: 'Quién administra MenYU' }
  return { titulo: 'Marcas', subtitulo: 'Marcas y restaurantes' }
}

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
  const { titulo, subtitulo } = encabezadoDe(pathname)

  return (
    <Shell
      secciones={SECCIONES}
      titulo={titulo}
      subtitulo={subtitulo}
      contexto={<ContextoDeRoot />}
      email={email}
      onCerrarSesion={cerrarSesion}
    />
  )
}
