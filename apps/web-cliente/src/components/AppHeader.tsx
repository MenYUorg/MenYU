import { useNavigate } from 'react-router-dom'

const TOKEN_KEY = 'menyu_access_token'
const REFRESH_KEY = 'menyu_refresh_token'

const C = {
  orange: '#E8563A',
  navy: '#2D3561',
  textSub: '#6B7280',
  border: '#ECECEE',
} as const

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
  } catch {
    return null
  }
}

interface AppHeaderProps {
  hideAuthButtons?: boolean
}

export function AppHeader({ hideAuthButtons = false }: AppHeaderProps) {
  const navigate = useNavigate()
  const token = localStorage.getItem(TOKEN_KEY)
  const payload = token ? decodeJwtPayload(token) : null
  const nombre = typeof payload?.['nombre'] === 'string' ? payload['nombre'] : null

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    navigate('/')
  }

  return (
    <header style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      height: 60,
      background: '#FFFFFF',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      zIndex: 100,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 800,
          fontSize: 22,
          color: C.navy,
          letterSpacing: '-0.02em',
        }}>
          Men<span style={{ color: C.orange }}>YU</span>
        </span>
      </button>

      {!hideAuthButtons && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {nombre ? (
            <>
              <span style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                color: C.textSub,
                maxWidth: 130,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                Hola, {nombre}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 600,
                  fontSize: 13,
                  color: C.orange,
                  background: 'none',
                  border: `1.5px solid ${C.orange}`,
                  borderRadius: 8,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/auth')}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 600,
                  fontSize: 13,
                  color: C.navy,
                  background: 'none',
                  border: `1.5px solid ${C.border}`,
                  borderRadius: 8,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Ingresar
              </button>
              <button
                onClick={() => navigate('/auth?tab=register')}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#FFFFFF',
                  background: C.orange,
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
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
