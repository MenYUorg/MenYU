import { useNavigate } from 'react-router-dom'
import { useIrAlIngreso } from '../../hooks/useIrAlIngreso'
import type { AccionDeIngreso } from '../../utils/cuenta'
import { Icono } from '../discovery/Icono'
import { ImagenLogo } from './ImagenLogo'
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
  nombreRestaurante: string
  /** La dirección del restaurante; `null` si no está cargada (entonces no se muestra nada). */
  direccion: string | null
  /** El logo del restaurante (o el de su marca) ya resuelto; `null` si ninguno tiene: se muestra el de MenYU. */
  logoUrl: string | null
  /** El cliente con cuenta que inició sesión en este navegador (`null` si no hay). */
  usuario: { nombre: string; email: string } | null
  /** El nombre que dio el comensal al entrar a la mesa (solo en la mesa). */
  comensalNombre: string | null
  /** Si se ofrece "Cerrar sesión" (no en una mesa que ya pidió algo). */
  puedeCerrarSesion: boolean
  onCerrarSesion: () => void
}

/**
 * El menú lateral. Arriba, el restaurante: su logo, su nombre y su dirección (al abrirse, el logo se agranda y el texto
 * aparece, con una animación corta que se apaga si la persona pidió menos movimiento). Después, la cuenta: sin ella,
 * iniciar sesión o crear una; con ella, el saludo con su nombre (y "Cerrar sesión" si se puede). Abajo, las filas: en la
 * mesa lo del pedido (etiquetar, mis pedidos, pagar); en la carta, que no tiene sesión, entrar a una mesa del
 * restaurante o volver al inicio. Iniciar sesión o registrarse es en web-auth (o, donde esta app no comparte su sesión,
 * en el login de `/auth`), y vuelve a esta misma pantalla: la carta o el menú de la mesa.
 */
export function MenuDrawer({
  abierto, onCerrar, modo, restauranteId, nombreRestaurante, direccion, logoUrl,
  usuario, comensalNombre, puedeCerrarSesion, onCerrarSesion,
}: MenuDrawerProps) {
  const navigate = useNavigate()
  const ir = (ruta: string) => { onCerrar(); navigate(ruta) }

  const irAlIngreso = useIrAlIngreso()
  const irAWebAuth = (accion: AccionDeIngreso) => { onCerrar(); irAlIngreso(accion) }

  const rutaDelRestaurante = `/restaurante/${encodeURIComponent(restauranteId)}`
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
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        transform: abierto ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.26s cubic-bezier(0.32,0.72,0,1)',
      }}>
        {/* Cabeza: el restaurante y la cuenta */}
        <div style={{ background: `linear-gradient(135deg, ${CM.navy} 0%, #3d4880 100%)`, padding: '22px 18px 18px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              className={`origin-top-left transition-transform duration-300 ease-out motion-reduce:transition-none ${abierto ? 'scale-100' : 'scale-[0.55]'}`}
              style={{ width: 72, height: 72, flexShrink: 0, padding: 6, boxSizing: 'border-box', background: 'white', borderRadius: 16, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}
            >
              <ImagenLogo logoUrl={logoUrl} />
            </div>
            <div
              className={`min-w-0 flex-1 transition-[opacity,transform] duration-300 delay-100 ease-out motion-reduce:transition-none ${abierto ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`}
            >
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 800, fontSize: 18, lineHeight: 1.2, color: 'white', overflowWrap: 'anywhere' }}>
                {nombreRestaurante}
              </div>
              {direccion && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 6, fontFamily: 'Inter,sans-serif', fontWeight: 500, fontSize: 13, lineHeight: 1.35, color: 'rgba(255,255,255,0.92)' }}>
                  <span style={{ flexShrink: 0, marginTop: 1.5, display: 'inline-flex' }}><Icono nombre="pin" tam={14} /></span>
                  <span style={{ overflowWrap: 'anywhere' }}>{direccion}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.14)', margin: '16px 0 14px' }} />

          {usuario ? (
            <>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: 'white', lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                ¡Hola, {usuario.nombre}!
              </div>
              {usuario.email && (
                <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, overflowWrap: 'anywhere' }}>
                  {usuario.email}
                </div>
              )}
              {puedeCerrarSesion && (
                <button
                  style={{ marginTop: 14, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}
                  onClick={onCerrarSesion}
                >
                  Cerrar sesión
                </button>
              )}
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 17, color: 'white', lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                {saludo}
              </div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2, marginBottom: 14 }}>
                Estás navegando como invitado
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  style={{ background: CM.orange, color: 'white', border: 'none', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  onClick={() => irAWebAuth('ingresar')}
                >
                  Iniciar sesión
                </button>
                <button
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.22)', borderRadius: 8, padding: '10px 16px', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  onClick={() => irAWebAuth('crear')}
                >
                  Crear cuenta gratis
                </button>
              </div>
            </>
          )}
        </div>

        {/* Cuerpo */}
        <div style={{ flex: 1, padding: '10px 8px' }}>
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
              <DrawerRow icon="🏠" label="Volver al inicio" onClick={() => ir('/')} />
            </>
          )}
        </div>

        {/* Pie */}
        <div style={{ padding: '12px 18px 20px', borderTop: `1px solid ${CM.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
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
