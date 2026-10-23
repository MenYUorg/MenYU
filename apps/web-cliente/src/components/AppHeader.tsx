import { useNavigate } from 'react-router-dom'
import { useCuenta } from '../hooks/useCuenta'
import { urlDeIngreso } from '../utils/cuenta'
import { irA } from '../utils/navegar'

const C = {
  orange: '#E8563A',
  navy: '#2D3561',
  textSub: '#6B7280',
  border: '#ECECEE',
} as const

// Lo que cambia con el ancho va en clases de Tailwind (los estilos en línea no tienen media queries): por debajo de 640 px
// el header es más compacto; por debajo de 385 px el logo baja a 24 px de alto y por debajo de 340 px a 20 px (siempre con
// su proporción). Los botones se ven chicos pero se tocan como uno de 44 px de alto: el `::after` agranda el área de toque.
const BOTON = 'relative whitespace-nowrap after:absolute after:content-[\'\'] after:inset-x-[-2px] after:inset-y-[-8px] max-sm:after:inset-y-[-10px]'
const BOTON_CHICO = `${BOTON} rounded-lg px-[14px] py-[6px] text-[13px] max-sm:rounded-[7px] max-sm:px-[10px] max-sm:py-[5px] max-sm:text-[12px] max-[339px]:px-2 max-[339px]:text-[11.5px]`
const BOTON_CERRAR = 'relative flex-none whitespace-nowrap rounded-lg px-3 py-[6px] text-[13px] after:absolute after:content-[\'\'] after:inset-x-[-2px] after:inset-y-[-8px] max-sm:rounded-md max-sm:px-[9px] max-sm:py-[3px] max-sm:text-[11px] max-sm:after:inset-x-[-4px] max-sm:after:inset-y-[-12px]'

interface AppHeaderProps {
  hideAuthButtons?: boolean
}

/**
 * El header de las pantallas públicas. Con una cuenta (utils/cuenta.ts), el saludo con su nombre y "Cerrar sesión"; sin
 * ella, ingresar o registrarse en web-auth, que vuelve a esta pantalla (docs/auth/specs/auth.md, Fase 4b). Mientras se
 * lee la sesión no muestra ninguno de los dos, para no hacer parpadear "Ingresar" a quien ya entró.
 */
export function AppHeader({ hideAuthButtons = false }: AppHeaderProps) {
  const navigate = useNavigate()
  const { cargando, cuenta, cerrarSesion } = useCuenta()
  const nombre = cuenta?.nombre ?? null

  const handleLogout = async () => {
    await cerrarSesion()
    navigate('/')
  }

  return (
    <header
      className="px-5 max-sm:px-4 max-[339px]:px-3"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        // Mínimo: un nombre largo se parte en líneas (nunca se corta con "...") y el header crece lo necesario.
        minHeight: 60,
        background: '#FFFFFF',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 6,
        paddingBottom: 6,
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}
    >
      <button
        onClick={() => navigate('/')}
        className="relative flex-none after:absolute after:content-[''] after:inset-x-[-4px] after:inset-y-[-12px]"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <img
          src="/logo.png"
          alt="MenYU"
          className="h-7 max-[384px]:h-6 max-[339px]:h-5"
          style={{ width: 'auto', display: 'block' }}
        />
      </button>

      {!hideAuthButtons && !cargando && (
        // Siempre queda un espacio de 16 px o más entre el logo y los botones (12 px en los más angostos).
        <div className="ml-3 flex min-w-0 items-center gap-2 max-sm:ml-4 max-sm:gap-1.5 max-[339px]:ml-3 max-[339px]:gap-[5px]">
          {nombre ? (
            // En celular el saludo va arriba y el botón debajo, alineados a la derecha; desde 640 px, uno al lado del otro.
            <div className="flex min-w-0 flex-col items-end gap-[3px] text-right sm:flex-row sm:items-center sm:gap-[10px]">
              <span
                className="text-[13px] leading-[1.3] max-sm:text-[12px] max-sm:leading-[1.25]"
                style={{ fontFamily: 'Inter, sans-serif', color: C.textSub, overflowWrap: 'anywhere' }}
              >
                Hola, {nombre}
              </span>
              <button
                onClick={() => void handleLogout()}
                className={BOTON_CERRAR}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 600,
                  color: C.orange,
                  background: 'none',
                  border: `1.5px solid ${C.orange}`,
                  cursor: 'pointer',
                }}
              >
                Cerrar sesión
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => irA(urlDeIngreso('ingresar'))}
                className={BOTON_CHICO}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 600,
                  color: C.navy,
                  background: 'none',
                  border: `1.5px solid ${C.border}`,
                  cursor: 'pointer',
                }}
              >
                Ingresar
              </button>
              <button
                onClick={() => irA(urlDeIngreso('crear'))}
                className={BOTON_CHICO}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: C.orange,
                  border: `1.5px solid ${C.orange}`,
                  cursor: 'pointer',
                }}
              >
                Registrarme
              </button>
            </>
          )}
        </div>
      )}
    </header>
  )
}
