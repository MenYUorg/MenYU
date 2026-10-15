import { useNavigate } from 'react-router-dom'
import type { ModoMenu } from './modo'
import { CM } from './paleta'

function DrawerRow({
  icon, label, badge, onClick, primary,
}: {
  icon: string; label: string; badge?: string; onClick: () => void; primary?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
        color: primary ? CM.orange : CM.text,
        background: primary ? CM.orangeSoft : 'transparent',
        transition: 'background .12s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!primary) (e.currentTarget as HTMLDivElement).style.background = CM.bg }}
      onMouseLeave={(e) => { if (!primary) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: primary ? CM.orange : '#F4F4F6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, flexShrink: 0,
        ...(primary ? { color: 'white' } : {}),
      }}>{icon}</span>
      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 600, color: CM.textMuted,
          background: CM.bg, padding: '2px 8px', borderRadius: 999,
          fontFamily: 'Montserrat,sans-serif',
        }}>
          {badge}
        </span>
      )}
    </div>
  )
}

interface MenuDrawerProps {
  abierto: boolean
  onCerrar: () => void
  modo: ModoMenu
  restauranteId: string
  /** El cliente con cuenta que inició sesión en este navegador (`null` si no hay). */
  usuario: { nombre: string; email: string } | null
  /** El nombre que dio el comensal al entrar a la mesa (solo en la mesa). */
  comensalNombre: string | null
  onCerrarSesion: () => void
}

/**
 * El menú lateral. En la mesa ofrece lo del pedido (etiquetar, mis pedidos, pagar); en la carta, que no tiene sesión,
 * ofrece entrar a una mesa del restaurante y volver a su pantalla. En los dos, iniciar sesión o crear una cuenta (desde
 * la carta se vuelve a la carta al terminar).
 */
export function MenuDrawer({ abierto, onCerrar, modo, restauranteId, usuario, comensalNombre, onCerrarSesion }: MenuDrawerProps) {
  const navigate = useNavigate()
  const ir = (ruta: string) => { onCerrar(); navigate(ruta) }

  const rutaDelRestaurante = `/restaurante/${encodeURIComponent(restauranteId)}`
  // Después de iniciar sesión o registrarse, la carta vuelve a la carta.
  const volver = modo === 'carta' ? `volver=${encodeURIComponent(`${rutaDelRestaurante}/carta`)}` : ''
  const rutaAuth = (tab?: 'register') => {
    const params = [tab ? `tab=${tab}` : '', volver].filter(Boolean).join('&')
    return params ? `/auth?${params}` : '/auth'
  }
  const saludo = modo === 'mesa' && comensalNombre ? `¡Hola, ${comensalNombre}!` : '¡Hola!'

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onCerrar}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(45,53,97,0.45)',
          opacity: abierto ? 1 : 0,
          pointerEvents: abierto ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        width: '82%', maxWidth: 320,
        background: 'white',
        boxShadow: '4px 0 32px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        transform: abierto ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.26s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* Cabeza */}
        <div style={{ background: `linear-gradient(135deg, ${CM.navy} 0%, #3d4880 100%)`, padding: '22px 18px 18px' }}>
          {usuario ? (
            <>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontFamily: 'Montserrat,sans-serif', fontWeight: 700, color: 'white', marginBottom: 10 }}>
                {usuario.nombre.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: 'white', lineHeight: 1.2 }}>
                ¡Hola, {usuario.nombre.split(' ')[0]}!
              </div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, marginBottom: 14 }}>
                {usuario.email}
              </div>
              <button
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}
                onClick={onCerrarSesion}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 10 }}>
                👤
              </div>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: 'white', lineHeight: 1.2 }}>
                {saludo}
              </div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, marginBottom: 14 }}>
                Estás navegando como invitado
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  style={{ background: CM.orange, color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  onClick={() => ir(rutaAuth())}
                >
                  Iniciar sesión
                </button>
                <button
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  onClick={() => ir(rutaAuth('register'))}
                >
                  Crear cuenta gratis
                </button>
              </div>
            </>
          )}
        </div>

        {/* Cuerpo */}
        <div style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {modo === 'mesa' ? (
            <>
              <DrawerRow icon="🏷️" label="Etiquetar pedidos" onClick={() => ir('/etiquetar')} />
              <DrawerRow icon="📋" label="Mis pedidos" primary onClick={() => ir('/pedidos')} />
              {usuario && <DrawerRow icon="⭐" label="Mis puntos" badge="Próximamente" onClick={() => {}} />}
              <DrawerRow icon="💳" label="Pagar la cuenta" onClick={() => ir('/pagar')} />
            </>
          ) : (
            <>
              <DrawerRow icon="🍽️" label="Ingresar a una mesa" primary onClick={() => ir(`${rutaDelRestaurante}/mesa`)} />
              <DrawerRow icon="🏠" label="Volver al restaurante" onClick={() => ir(rutaDelRestaurante)} />
            </>
          )}
        </div>

        {/* Pie */}
        <div style={{ padding: '12px 18px 20px', borderTop: `1px solid ${CM.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, color: CM.textMuted }}>v1.0</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, color: CM.textMuted }}>powered by</span>
            <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 12, color: CM.navy, marginLeft: 2 }}>MENY</span>
            <div style={{ width: 10, height: 13, background: CM.orange, borderRadius: '2px 2px 50% 50% / 2px 2px 28% 28%', position: 'relative', top: 1 }} />
          </div>
        </div>
      </div>
    </>
  )
}
