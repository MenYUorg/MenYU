import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePerfil } from '@menyu/auth-client'
import { LogoMenYuOscuro } from '@menyu/ui'
import { ChefHat, LogOut, UtensilsCrossed } from 'lucide-react'
import { cerrarSesion } from '../../services/socket'
import {
  puedeVerCocina,
  puedeVerMozo,
  useContextoStore,
  useRolesActuales,
} from '../../store/contextoStore'

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(nombre: string): string {
  return nombre
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// ── PanelCard ─────────────────────────────────────────────────────────────────
function PanelCard({
  icon,
  title,
  description,
  barColor,
  chipBg,
  iconColor,
  hoverBorder,
  accentColor,
  fullWidth,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  barColor: string
  chipBg: string
  iconColor: string
  hoverBorder: string
  accentColor: string
  fullWidth?: boolean
  onClick: () => void
}) {
  const [hov, setHov] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position:     'relative',
        overflow:     'hidden',
        background:   '#FFFFFF',
        border:       `1px solid ${hov ? hoverBorder : '#E6E8EF'}`,
        borderRadius: 16,
        padding:      '18px 20px',
        cursor:       'pointer',
        textAlign:    'left',
        gridColumn:   fullWidth ? '1 / -1' : undefined,
        transform:    hov ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow:    hov ? '0 14px 32px rgba(45,53,97,0.12)' : 'none',
        transition:   'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
        display:      'flex',
        flexDirection: 'column',
        gap:          14,
      }}
    >
      {/* Barra izquierda */}
      <div style={{
        position:    'absolute',
        top:         0,
        left:        0,
        width:       hov ? 6 : 4,
        height:      '100%',
        background:  barColor,
        transition:  'width 0.18s',
        borderRadius: '0 2px 2px 0',
      }} />

      {/* Chip de ícono */}
      <div style={{
        width:          42,
        height:         42,
        borderRadius:   12,
        background:     chipBg,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        color:          iconColor,
        flexShrink:     0,
      }}>
        {icon}
      </div>

      {/* Textos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 800,
          fontSize:   16,
          color:      '#2D3561',
          margin:     0,
        }}>
          {title}
        </p>
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize:   12,
          color:      '#6B7280',
          margin:     0,
          lineHeight: 1.4,
        }}>
          {description}
        </p>
      </div>

      {/* Link */}
      <p style={{
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700,
        fontSize:   13,
        color:      accentColor,
        margin:     0,
        display:    'flex',
        alignItems: 'center',
        gap:        4,
      }}>
        Ingresar
        <span style={{
          display:    'inline-block',
          transform:  hov ? 'translateX(3px)' : 'translateX(0)',
          transition: 'transform 0.15s',
        }}>
          →
        </span>
      </p>
    </button>
  )
}

// ── SelectorPage ──────────────────────────────────────────────────────────────
export function SelectorPage() {
  const navigate = useNavigate()
  const perfil = usePerfil()
  const restaurantes = useContextoStore((s) => s.restaurantes)
  const restauranteId = useContextoStore((s) => s.restauranteId)
  const setRestaurante = useContextoStore((s) => s.setRestaurante)
  const roles = useRolesActuales()

  const nombreMostrado = perfil.nombre || perfil.email
  const initials = getInitials(nombreMostrado)
  const verCocina = puedeVerCocina(roles)
  const verMozo = puedeVerMozo(roles)
  const unaSolaVista = verCocina !== verMozo

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Topbar ── */}
      <header style={{
        background:     '#2D3561',
        height:         56,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 20px',
        flexShrink:     0,
      }}>
        {/* Logo */}
        <LogoMenYuOscuro alto={22} />

        {/* Botón salir */}
        <LogoutBtn onClick={() => void cerrarSesion()} />
      </header>

      {/* ── Main ── */}
      <main style={{
        flex:           1,
        background:     '#F6F7F9',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '16px 28px',
      }}>
        <div style={{ width: '100%', maxWidth: 660 }}>

          {/* Greeting */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, marginBottom: 16 }}>
            <div style={{
              width:          64,
              height:         64,
              borderRadius:   '50%',
              background:     '#FDF0ED',
              border:         '2px solid #F6D6CC',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              color:          '#E8563A',
              fontFamily:     'Montserrat, sans-serif',
              fontWeight:     800,
              fontSize:       22,
            }}>
              {initials}
            </div>
            <p style={{
              fontFamily:    'Inter, sans-serif',
              fontSize:      11,
              fontWeight:    600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color:         '#6B7280',
              margin:        0,
            }}>
              Sesión iniciada como
            </p>
            <p style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 800,
              fontSize:   27,
              color:      '#2D3561',
              margin:     0,
            }}>
              {nombreMostrado}
            </p>
            <p style={{
              fontFamily: 'Inter, sans-serif',
              fontSize:   14,
              color:      '#6B7280',
              margin:     0,
            }}>
              {restauranteId ? '¿A qué panel querés ingresar?' : 'Elegí el restaurante donde vas a trabajar.'}
            </p>
          </div>

          {/* Restaurante — solo si trabaja en más de uno */}
          {restaurantes.length > 1 && (
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="restaurante"
                style={{
                  display:      'block',
                  fontFamily:   'Inter, sans-serif',
                  fontSize:     12,
                  color:        '#6B7280',
                  marginBottom: 6,
                }}
              >
                Restaurante
              </label>
              <select
                id="restaurante"
                value={restauranteId ?? ''}
                onChange={(e) => setRestaurante(e.target.value)}
                style={{
                  width:        '100%',
                  padding:      '10px 12px',
                  borderRadius: 10,
                  border:       '1px solid #E6E8EF',
                  background:   'white',
                  fontFamily:   'Inter, sans-serif',
                  fontSize:     13,
                  color:        '#1F2333',
                  outline:      'none',
                  boxSizing:    'border-box',
                }}
              >
                <option value="" disabled>Elegí un restaurante…</option>
                {restaurantes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.marcaNombre ? `${r.nombre} · ${r.marcaNombre}` : r.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Grid de cards */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap:                 12,
          }}>
            {verCocina && (
              <PanelCard
                icon={<ChefHat size={26} />}
                title="Panel Cocina"
                description="Gestioná los pedidos en preparación en tiempo real"
                barColor="#E8563A"
                chipBg="#FDF0ED"
                iconColor="#E8563A"
                hoverBorder="#F3B6A8"
                accentColor="#E8563A"
                fullWidth={unaSolaVista}
                onClick={() => navigate('/cocina')}
              />
            )}
            {verMozo && (
              <PanelCard
                icon={<UtensilsCrossed size={26} />}
                title="Panel Mozo"
                description="Tomá pedidos, gestioná mesas y atendé llamados"
                barColor="#2D3561"
                chipBg="#EEF0F8"
                iconColor="#2D3561"
                hoverBorder="#B9C0DD"
                accentColor="#2D3561"
                fullWidth={unaSolaVista}
                onClick={() => navigate('/mozo')}
              />
            )}
          </div>

          {/* Footer */}
          <p style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   12,
            color:      '#9CA3AF',
            textAlign:  'center',
            marginTop:  16,
          }}>
            Tus permisos están vinculados a tu cuenta. Si algo no aparece, consultá con el gerente.
          </p>

        </div>
      </main>
    </div>
  )
}

// ── LogoutBtn — componente separado para manejar hover sin inline handlers repetidos ──
function LogoutBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          6,
        background:   hov ? 'rgba(255,255,255,0.10)' : 'none',
        border:       '1px solid rgba(255,255,255,0.25)',
        borderRadius: 8,
        padding:      '6px 12px',
        color:        'rgba(255,255,255,0.85)',
        fontFamily:   'Inter, sans-serif',
        fontSize:     12,
        cursor:       'pointer',
        transition:   'background 0.15s',
      }}
    >
      <LogOut size={13} />
      Salir
    </button>
  )
}
