import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronRight, Mail, Users, X } from 'lucide-react'
import { usePerfil } from '@menyu/auth-client'
import type { MiembroDelPersonal, PersonalDelRestaurante, Rol } from '@menyu/types'
import { useContextStore, useRolActual } from '../../../store/contextStore'
import { api, ApiError } from '../../../services/api'
import { ambitoDeLaInvitacion, etiquetaDeRol, puedeQuitarAcceso, rolesQuePuedeInvitar } from './personal'

/* ── types ─────────────────────────────────────────────────────────────────── */

interface MozoItem {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  activo: boolean
  esJefeSalon: boolean
  createdAt: string
}

interface MesaConMozos {
  id: string
  numero: string
  estado: string
  mozoMesas: { id: string; mozoId: string; mozo: { id: string; nombre: string } }[]
}

type MesaAsignada = { id: string; numero: string; estado: string }

/* ── palette ────────────────────────────────────────────────────────────────── */
const C = {
  navy:    '#2D3561',
  navyBg:  '#E5E7F0',
  orange:  '#E8563A',
  border:  '#e5e7eb',
  text:    '#111827',
  sub:     '#6b7280',
  muted:   '#9ca3af',
  red:     '#dc2626',
  bg:      '#f9fafb',
  blueBg:  '#f8f9ff',
  green:   '#16a34a',
} as const

/* ── helpers ────────────────────────────────────────────────────────────────── */

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function emailInitials(email: string): string {
  const local = email.split('@')[0]
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

/* ── ModalConfirmar ─────────────────────────────────────────────────────────── */

interface ModalConfirmarProps {
  open: boolean
  titulo: string
  mensaje: string
  labelConfirmar: string
  colorConfirmar: string
  onConfirmar: () => void
  onCancelar: () => void
}

function ModalConfirmar({ open, titulo, mensaje, labelConfirmar, colorConfirmar, onConfirmar, onCancelar }: ModalConfirmarProps) {
  if (!open) return null
  return (
    <div
      onClick={onCancelar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', width: 360, maxWidth: '95vw', borderRadius: 16, padding: 28 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <AlertTriangle size={32} color={colorConfirmar} />
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: C.navy, margin: 0, textAlign: 'center' }}>
            {titulo}
          </h3>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.sub, margin: 0, textAlign: 'center' }}>
            {mensaje}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancelar}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'white', color: '#374151', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none', background: colorConfirmar, color: 'white', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── MozoAvatar ─────────────────────────────────────────────────────────────── */

function MozoAvatar({ nombre, esJefeSalon, size = 40 }: { nombre: string; esJefeSalon: boolean; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: esJefeSalon ? C.navy : C.navyBg,
      color: esJefeSalon ? 'white' : C.navy,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
      fontSize: size <= 40 ? 14 : 18, flexShrink: 0,
    }}>
      {initials(nombre)}
    </div>
  )
}

/* ── PersonaAvatar ──────────────────────────────────────────────────────────── */

function PersonaAvatar({ email, size = 40 }: { email: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#dcfce7', color: C.green,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
      fontSize: size <= 40 ? 14 : 18, flexShrink: 0,
    }}>
      {emailInitials(email)}
    </div>
  )
}

/* ── InputField ─────────────────────────────────────────────────────────────── */

function InputField({
  label, type = 'text', value, onChange, placeholder, required,
}: {
  label: string; type?: string; value: string
  onChange: (v: string) => void; placeholder?: string; required?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 13, fontWeight: 500,
        color: C.text, marginBottom: 5, fontFamily: 'Inter, sans-serif',
      }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '9px 12px', fontSize: 14, fontFamily: 'Inter, sans-serif',
          color: C.text, outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

/* ── ModalBase ──────────────────────────────────────────────────────────────── */

function ModalBase({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white', width: 420, borderRadius: 16, padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: C.navy }}>
            {title}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── MozoRow ────────────────────────────────────────────────────────────────── */

function MozoRow({
  mozo, mesas, llamadosHoy, onClick,
}: {
  mozo: MozoItem; mesas: MesaAsignada[]; llamadosHoy: number; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'white', border: `1px solid ${hov ? C.navy : C.border}`,
        borderRadius: 12, padding: '14px 20px', cursor: 'pointer',
        marginBottom: 10, transition: 'border-color 0.15s',
      }}
    >
      <MozoAvatar nombre={mozo.nombre} esJefeSalon={mozo.esJefeSalon} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: 'Inter, sans-serif' }}>
            {mozo.nombre}
          </span>
          {mozo.esJefeSalon && (
            <span style={{
              background: C.navy, color: 'white', fontSize: 10,
              padding: '2px 8px', borderRadius: 999, marginLeft: 8,
              fontFamily: 'Inter, sans-serif', fontWeight: 600,
            }}>
              Jefe de salón
            </span>
          )}
        </div>
        {mozo.email && (
          <div style={{ fontSize: 13, color: C.sub, fontFamily: 'Inter, sans-serif' }}>
            {mozo.email}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 500, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginRight: 6 }}>
          Mesas:
        </span>
        {mesas.length === 0 ? (
          <span style={{ fontSize: 13, color: C.muted, fontFamily: 'Inter, sans-serif' }}>Sin mesas</span>
        ) : (
          mesas.map((m) => (
            <span key={m.id} style={{
              background: C.navyBg, color: C.navy,
              fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
              fontSize: 12, padding: '4px 10px', borderRadius: 999,
            }}>
              {m.numero}
            </span>
          ))
        )}
        <span style={{ fontSize: 13, color: C.sub, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', marginLeft: 6 }}>
          {llamadosHoy} llamado{llamadosHoy !== 1 ? 's' : ''} hoy
        </span>
        <ChevronRight size={16} color={C.muted} />
      </div>
    </div>
  )
}

/* ── MiembroRow ─────────────────────────────────────────────────────────────── */

function MiembroRow({
  miembro, esPropia, puedeQuitar, onQuitar,
}: {
  miembro: MiembroDelPersonal; esPropia: boolean; puedeQuitar: boolean; onQuitar: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      background: 'white', border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '14px 20px', marginBottom: 10,
    }}>
      <PersonaAvatar email={miembro.email} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: 'Inter, sans-serif' }}>
            {miembro.nombre}
          </span>
          <span style={{
            background: C.navyBg, color: C.navy, fontSize: 10,
            padding: '2px 8px', borderRadius: 999,
            fontFamily: 'Inter, sans-serif', fontWeight: 600,
          }}>
            {etiquetaDeRol(miembro.rol)}
          </span>
          {esPropia && (
            <span style={{ fontSize: 11, color: C.sub, fontFamily: 'Inter, sans-serif' }}>Vos</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: C.sub, fontFamily: 'Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {miembro.email}
        </div>
      </div>
      {/* Nadie se quita el acceso a sí mismo, y cada rol solo puede quitar a quien podría invitar. */}
      {puedeQuitar && !esPropia && (
        <button
          onClick={onQuitar}
          style={{
            border: `1px solid ${C.border}`, borderRadius: 8, background: 'white',
            color: C.red, fontFamily: 'Inter, sans-serif', fontWeight: 600,
            fontSize: 13, padding: '7px 14px', cursor: 'pointer',
          }}
        >
          Quitar acceso
        </button>
      )}
    </div>
  )
}

/* ── SinCuentaRow ───────────────────────────────────────────────────────────── */

/** Un mozo del login propio que todavía no tiene cuenta: se lo invita con su email. */
function SinCuentaRow({
  mozo, puedeInvitar, onInvitar,
}: {
  mozo: { mozoId: string; nombre: string; email: string | null; esJefeSalon: boolean }
  puedeInvitar: boolean
  onInvitar: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      background: 'white', border: `1px dashed ${C.border}`,
      borderRadius: 12, padding: '14px 20px', marginBottom: 10,
    }}>
      <MozoAvatar nombre={mozo.nombre} esJefeSalon={mozo.esJefeSalon} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: 'Inter, sans-serif' }}>
          {mozo.nombre}
        </div>
        <div style={{ fontSize: 13, color: C.sub, fontFamily: 'Inter, sans-serif' }}>
          {mozo.email ?? 'Sin email'} · Sin cuenta
        </div>
      </div>
      {puedeInvitar && (
        <button
          onClick={onInvitar}
          disabled={!mozo.email}
          title={mozo.email ? undefined : 'Para invitarlo hace falta su email'}
          style={{
            border: `1px solid ${C.navy}`, borderRadius: 8, background: 'white',
            color: C.navy, fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
            fontSize: 13, padding: '7px 14px', cursor: mozo.email ? 'pointer' : 'not-allowed',
            opacity: mozo.email ? 1 : 0.5,
          }}
        >
          Invitar
        </button>
      )}
    </div>
  )
}

/* ── MesaDisponibleTile ─────────────────────────────────────────────────────── */

function MesaDisponibleTile({ mesa, onAssign }: { mesa: MesaConMozos; onAssign: () => void }) {
  const [hov, setHov] = useState(false)
  const primerMozo = mesa.mozoMesas[0]
  return (
    <div
      onClick={onAssign}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 8, border: `2px solid ${hov ? C.navy : C.border}`,
        background: hov ? C.blueBg : 'white',
        padding: '12px 8px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 20, color: '#374151' }}>
        {mesa.numero}
      </span>
      <span style={{
        fontSize: 10, fontFamily: 'Inter, sans-serif',
        color: primerMozo ? C.sub : C.muted,
        textAlign: 'center', lineHeight: 1.3,
      }}>
        {primerMozo ? primerMozo.mozo.nombre : 'Sin mozo asignado'}
      </span>
    </div>
  )
}

/* ── DetailContent ──────────────────────────────────────────────────────────── */

function DetailContent({
  mozo, mesasDelMozo, mesasDisponibles,
  editExpanded, setEditExpanded,
  editNombre, setEditNombre,
  editTelefono, setEditTelefono,
  editLoading, editError,
  onAssign, onUnassign, onGuardar, onEliminar, onCancelEdit,
  canEdit, sinCuenta, eliminarError,
}: {
  mozo: MozoItem
  mesasDelMozo: MesaAsignada[]
  mesasDisponibles: MesaConMozos[]
  editExpanded: boolean
  setEditExpanded: (v: boolean) => void
  editNombre: string; setEditNombre: (v: string) => void
  editTelefono: string; setEditTelefono: (v: string) => void
  editLoading: boolean; editError: string
  onAssign: (mesa: MesaConMozos) => void
  onUnassign: (mesa: MesaAsignada) => void
  onGuardar: () => void
  onEliminar: () => void
  onCancelEdit: () => void
  canEdit: boolean
  /** Un mozo sin cuenta se puede borrar; con cuenta, el acceso se quita desde Personal (el backend da 409). */
  sinCuenta: boolean
  eliminarError: string
}) {
  const tileGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
    gap: 8,
  }

  return (
    <div>
      {/* Panel mesas */}
      <div style={{
        background: 'white', border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20, marginBottom: 16,
      }}>
        <div style={{
          fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
          fontSize: 15, color: C.navy, marginBottom: 20,
        }}>
          Mesas asignadas
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Izquierda: asignadas */}
          <div>
            <div style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: C.sub, fontFamily: 'Inter, sans-serif', fontWeight: 600, marginBottom: 12,
            }}>
              Asignadas a {mozo.nombre}
            </div>
            {mesasDelMozo.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: 20,
                color: C.muted, fontSize: 13, fontFamily: 'Inter, sans-serif',
              }}>
                Sin mesas asignadas
              </div>
            ) : (
              <div style={tileGrid}>
                {mesasDelMozo.map((mesa) => (
                  <div key={mesa.id} style={{
                    borderRadius: 8, border: `2px solid ${C.navy}`,
                    background: C.navyBg, padding: '12px 8px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                      fontSize: 20, color: C.navy,
                    }}>
                      {mesa.numero}
                    </span>
                    <button
                      onClick={() => onUnassign(mesa)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 10, color: C.red, fontFamily: 'Inter, sans-serif', padding: 0,
                      }}
                    >
                      × quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Derecha: disponibles */}
          <div>
            <div style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: C.sub, fontFamily: 'Inter, sans-serif', fontWeight: 600, marginBottom: 12,
            }}>
              Agregar mesa
            </div>
            {mesasDisponibles.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: 20,
                color: C.muted, fontSize: 13, fontFamily: 'Inter, sans-serif',
              }}>
                Todas las mesas están asignadas.
              </div>
            ) : (
              <div style={tileGrid}>
                {mesasDisponibles.map((mesa) => (
                  <MesaDisponibleTile key={mesa.id} mesa={mesa} onAssign={() => onAssign(mesa)} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Toggle edición */}
      {canEdit && (
        <button
          onClick={() => setEditExpanded(!editExpanded)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: editExpanded ? C.navy : C.sub,
            fontFamily: 'Inter, sans-serif', padding: 0,
          }}
        >
          ⚙ Editar datos del mozo
        </button>
      )}

      {canEdit && editExpanded && (
        <div style={{
          background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: 20, marginTop: 12,
        }}>
          <InputField label="Nombre" value={editNombre} onChange={setEditNombre} required />
          <InputField label="Teléfono" value={editTelefono} onChange={setEditTelefono} placeholder="Opcional" />
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.sub, margin: '0 0 14px' }}>
            El email y la contraseña son de su cuenta, y los maneja desde el inicio de sesión de MenYU.
          </p>

          {editError && (
            <div style={{ color: C.red, fontSize: 13, marginBottom: 14, fontFamily: 'Inter, sans-serif' }}>
              {editError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
            <button
              onClick={onCancelEdit}
              style={{
                border: `1px solid ${C.border}`, borderRadius: 8, background: 'white',
                color: C.sub, fontFamily: 'Inter, sans-serif', fontSize: 13,
                padding: '8px 16px', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={onGuardar}
              disabled={editLoading}
              style={{
                border: 'none', borderRadius: 8, background: C.orange,
                color: 'white', fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                fontSize: 13, padding: '8px 16px', cursor: 'pointer',
                opacity: editLoading ? 0.7 : 1,
              }}
            >
              {editLoading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            {sinCuenta ? (
              <button
                onClick={onEliminar}
                style={{
                  border: `1px solid ${C.red}`, borderRadius: 8, background: 'white',
                  color: C.red, fontFamily: 'Inter, sans-serif', fontWeight: 600,
                  fontSize: 13, padding: '8px 16px', cursor: 'pointer',
                }}
              >
                Eliminar mozo
              </button>
            ) : (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.sub, margin: 0 }}>
                Para que deje de trabajar acá, quitale el acceso desde Personal.
              </p>
            )}
            {eliminarError && (
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.red, margin: '10px 0 0' }}>
                {eliminarError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── MozosPage ──────────────────────────────────────────────────────────────── */

/**
 * Personal del restaurante (docs/auth/specs/auth.md, entrega 4.5): quién tiene acceso, invitar y quitar acceso, más el
 * perfil operativo de los mozos (mesas asignadas y llamados de hoy). El alta con contraseña ya no existe: con el token
 * de Supabase, una cuenta sin invitación no entra a nada.
 */
export function MozosPage() {
  const rolActual = useRolActual()
  const isOwner = rolActual === 'OWNER'
  const perfil = usePerfil()
  const { selectedRestauranteId, restaurantes: todosRestaurantes } = useContextStore()
  const marcaId = todosRestaurantes.find((r) => r.id === selectedRestauranteId)?.marcaId ?? null

  const [activeTab, setActiveTab] = useState<'personal' | 'mozos'>('personal')

  // ── Personal ───────────────────────────────────────────────────────────────
  const [personal,        setPersonal]        = useState<PersonalDelRestaurante | null>(null)
  const [loadingPersonal, setLoadingPersonal] = useState(true)
  const [errorPersonal,   setErrorPersonal]   = useState('')
  const [porQuitar,       setPorQuitar]       = useState<MiembroDelPersonal | null>(null)
  const [quitarError,     setQuitarError]     = useState('')

  // Invitar
  const [showInvitar,     setShowInvitar]     = useState(false)
  const [invitarEmail,    setInvitarEmail]    = useState('')
  const [invitarNombre,   setInvitarNombre]   = useState('')
  const [invitarRol,      setInvitarRol]      = useState<Rol>('MOZO')
  const [invitarLoading,  setInvitarLoading]  = useState(false)
  const [invitarError,    setInvitarError]    = useState('')
  const [invitadoAviso,   setInvitadoAviso]   = useState('')

  // ── Mozos ──────────────────────────────────────────────────────────────────
  const [mozos,           setMozos]           = useState<MozoItem[]>([])
  const [mesasPorMozo,    setMesasPorMozo]    = useState<Map<string, MesaAsignada[]>>(new Map())
  const [llamadosPorMozo, setLlamadosPorMozo] = useState<Map<string, number>>(new Map())
  const [todasLasMesas,   setTodasLasMesas]   = useState<MesaConMozos[]>([])
  const [loading,         setLoading]         = useState(true)

  const [selectedMozo, setSelectedMozo] = useState<MozoItem | null>(null)
  const [mesasDelMozo, setMesasDelMozo] = useState<MesaAsignada[]>([])
  const [editExpanded, setEditExpanded] = useState(false)
  const [confirmEliminar,   setConfirmEliminar]   = useState(false)
  const [confirmQuitarMesa, setConfirmQuitarMesa] = useState<{ mesaId: string; numero: string } | null>(null)
  const [eliminarError,     setEliminarError]     = useState('')

  const [editNombre,   setEditNombre]   = useState('')
  const [editTelefono, setEditTelefono] = useState('')
  const [editLoading,  setEditLoading]  = useState(false)
  const [editError,    setEditError]    = useState('')

  /* ── data loading ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!selectedRestauranteId) return
    void loadPersonal(selectedRestauranteId)
    void loadData(selectedRestauranteId)
  }, [selectedRestauranteId])

  async function loadPersonal(rid: string) {
    setLoadingPersonal(true)
    setErrorPersonal('')
    try {
      setPersonal(await api.personal.listar(rid))
    } catch (e) {
      setErrorPersonal(e instanceof ApiError ? e.message : 'No se pudo cargar el personal')
    } finally {
      setLoadingPersonal(false)
    }
  }

  async function loadData(rid: string) {
    setLoading(true)
    try {
      const [mozosList, mesasList] = await Promise.all([
        api.mozos.list(rid),
        api.mesas.list(rid),
      ])
      setMozos(mozosList)
      setTodasLasMesas(
        mesasList.map((m) => ({
          id: m.id,
          numero: m.numero,
          estado: m.estado,
          mozoMesas: m.mozoMesas ?? [],
        })),
      )

      const perMozo = await Promise.all(
        mozosList.map(async (m) => {
          const [mesas, { total }] = await Promise.all([
            api.mozos.getMesas(m.id),
            api.mozos.llamadosHoy(m.id),
          ])
          return { mozoId: m.id, mesas, llamados: total }
        }),
      )

      const mesasMap = new Map<string, MesaAsignada[]>()
      const llamadosMap = new Map<string, number>()
      for (const { mozoId, mesas, llamados } of perMozo) {
        mesasMap.set(mozoId, mesas)
        llamadosMap.set(mozoId, llamados)
      }
      setMesasPorMozo(mesasMap)
      setLlamadosPorMozo(llamadosMap)
    } finally {
      setLoading(false)
    }
  }

  /* ── invitar ──────────────────────────────────────────────────────────────── */

  const rolesOfrecidos = useMemo(
    () => (rolActual ? rolesQuePuedeInvitar(rolActual) : []),
    [rolActual],
  )

  function abrirInvitar(datos: { email?: string; nombre?: string; rol?: Rol } = {}) {
    setInvitarEmail(datos.email ?? '')
    setInvitarNombre(datos.nombre ?? '')
    setInvitarRol(datos.rol ?? (rolesOfrecidos.includes('MOZO') ? 'MOZO' : rolesOfrecidos[0] ?? 'MOZO'))
    setInvitarError('')
    setShowInvitar(true)
  }

  async function handleInvitar() {
    if (!selectedRestauranteId || !rolActual) return
    if (!invitarEmail || !invitarNombre) {
      setInvitarError('Completá el email y el nombre')
      return
    }
    const ambito = ambitoDeLaInvitacion(invitarRol, marcaId, selectedRestauranteId)
    if (!ambito) {
      setInvitarError('No se pudo determinar la marca de este restaurante')
      return
    }
    setInvitarLoading(true)
    setInvitarError('')
    try {
      const { invitacionEnviada } = await api.invitaciones.crear({
        email: invitarEmail,
        nombre: invitarNombre,
        rol: invitarRol,
        ...ambito,
      })
      setShowInvitar(false)
      setInvitadoAviso(
        invitacionEnviada
          ? `Invitación enviada a ${invitarEmail}`
          : `${invitarEmail} ya tenía cuenta en MenYU: ya puede entrar, sin mail de invitación`,
      )
      await loadPersonal(selectedRestauranteId)
      await loadData(selectedRestauranteId)
    } catch (e) {
      setInvitarError(e instanceof ApiError ? e.message : 'No se pudo invitar')
    } finally {
      setInvitarLoading(false)
    }
  }

  /* ── quitar acceso ────────────────────────────────────────────────────────── */

  async function ejecutarQuitarAcceso() {
    if (!selectedRestauranteId || !porQuitar) return
    const miembro = porQuitar
    setPorQuitar(null)
    setQuitarError('')
    try {
      await api.personal.quitarAcceso(selectedRestauranteId, miembro.membresiaId)
      await loadPersonal(selectedRestauranteId)
      await loadData(selectedRestauranteId)
    } catch (e) {
      setQuitarError(e instanceof ApiError ? e.message : 'No se pudo quitar el acceso')
    }
  }

  /* ── select mozo ─────────────────────────────────────────────────────────── */

  function handleSelectMozo(mozo: MozoItem) {
    setSelectedMozo(mozo)
    setMesasDelMozo(mesasPorMozo.get(mozo.id) ?? [])
    setEditExpanded(false)
    setEditNombre(mozo.nombre)
    setEditTelefono(mozo.telefono ?? '')
    setEditError('')
    setEliminarError('')
  }

  /* ── mesa assign / unassign ──────────────────────────────────────────────── */

  async function handleAssignMesa(mesa: MesaConMozos) {
    if (!selectedMozo) return
    try {
      await api.mozos.assignMesa(selectedMozo.id, mesa.id)
      const nuevas = [...mesasDelMozo, { id: mesa.id, numero: mesa.numero, estado: mesa.estado }]
      setMesasDelMozo(nuevas)
      setMesasPorMozo((prev) => new Map(prev).set(selectedMozo.id, nuevas))
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : 'Error al asignar mesa')
    }
  }

  function handleUnassignMesa(mesa: MesaAsignada) {
    setConfirmQuitarMesa({ mesaId: mesa.id, numero: mesa.numero })
  }

  async function ejecutarUnassignMesa() {
    if (!selectedMozo || !confirmQuitarMesa) return
    const { mesaId } = confirmQuitarMesa
    setConfirmQuitarMesa(null)
    try {
      await api.mozos.unassignMesa(selectedMozo.id, mesaId)
      const nuevas = mesasDelMozo.filter((m) => m.id !== mesaId)
      setMesasDelMozo(nuevas)
      setMesasPorMozo((prev) => new Map(prev).set(selectedMozo.id, nuevas))
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : 'Error al quitar mesa')
    }
  }

  /* ── edit mozo ───────────────────────────────────────────────────────────── */

  async function handleGuardar() {
    if (!selectedMozo) return
    setEditLoading(true)
    setEditError('')
    try {
      const updated = await api.mozos.update(selectedMozo.id, {
        nombre: editNombre,
        telefono: editTelefono,
      })
      setSelectedMozo(updated)
      setMozos((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      setEditExpanded(false)
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : 'Error al guardar')
    } finally {
      setEditLoading(false)
    }
  }

  async function ejecutarEliminar() {
    if (!selectedMozo) return
    setConfirmEliminar(false)
    setEliminarError('')
    try {
      await api.mozos.delete(selectedMozo.id)
      setMozos((prev) => prev.filter((m) => m.id !== selectedMozo.id))
      setSelectedMozo(null)
      if (selectedRestauranteId) await loadPersonal(selectedRestauranteId)
    } catch (e) {
      setEliminarError(e instanceof ApiError ? e.message : 'Error al eliminar mozo')
    }
  }

  /* ── memos ───────────────────────────────────────────────────────────────── */

  const mesasDisponibles = useMemo(() => {
    const ids = new Set(mesasDelMozo.map((m) => m.id))
    return todasLasMesas.filter((m) => !ids.has(m.id))
  }, [mesasDelMozo, todasLasMesas])

  const mozosSinCuenta = useMemo(
    () => new Set((personal?.sinCuenta ?? []).map((m) => m.mozoId)),
    [personal],
  )

  /* ── render ──────────────────────────────────────────────────────────────── */

  if (!selectedRestauranteId) {
    return (
      <div style={{ padding: '32px 28px', color: C.sub, fontFamily: 'Inter, sans-serif', fontSize: 14 }}>
        Seleccioná un restaurante para ver el personal.
      </div>
    )
  }

  const inDetail = !!selectedMozo

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Topbar ── */}
      <div style={{ padding: '20px 28px 0', flexShrink: 0 }}>
        {!inDetail ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Users size={20} color={C.navy} />
                <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 22, color: C.navy }}>
                  {activeTab === 'personal' ? 'Personal' : 'Mozos'}
                </span>
              </div>
              {activeTab === 'personal' && rolesOfrecidos.length > 0 && (
                <button
                  onClick={() => abrirInvitar()}
                  style={{
                    border: 'none', borderRadius: 8, background: C.orange,
                    color: 'white', fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                    fontSize: 13, padding: '8px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Mail size={14} /> Invitar
                </button>
              )}
            </div>

            <div style={{
              display: 'flex', gap: 2, marginBottom: 8,
              background: C.bg, borderRadius: 10, padding: 4,
              width: 'fit-content',
            }}>
              {(['personal', 'mozos'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    border: 'none', borderRadius: 7, padding: '6px 20px',
                    background: activeTab === tab ? C.navy : 'transparent',
                    color: activeTab === tab ? 'white' : C.sub,
                    fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13,
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                >
                  {tab === 'personal' ? 'Personal' : 'Mozos'}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => setSelectedMozo(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.sub, fontFamily: 'Inter, sans-serif', fontSize: 13,
                padding: 0, marginBottom: 10,
              }}
            >
              <ArrowLeft size={14} />
              Mozos
            </button>

            {selectedMozo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <MozoAvatar nombre={selectedMozo.nombre} esJefeSalon={selectedMozo.esJefeSalon} size={52} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 22, color: C.navy }}>
                      {selectedMozo.nombre}
                    </span>
                    {selectedMozo.esJefeSalon && (
                      <span style={{
                        background: C.navy, color: 'white', fontSize: 10,
                        padding: '2px 8px', borderRadius: 999,
                        fontFamily: 'Inter, sans-serif', fontWeight: 600,
                      }}>
                        Jefe de salón
                      </span>
                    )}
                  </div>
                  {selectedMozo.email && (
                    <div style={{ fontSize: 13, color: C.sub, fontFamily: 'Inter, sans-serif' }}>
                      {selectedMozo.email}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 28px' }}>
        {invitadoAviso && (
          <div
            role="status"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              background: '#E4F6EC', border: '1px solid #bbf7d0', borderRadius: 10,
              padding: '10px 14px', marginBottom: 14,
              fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#166534',
            }}
          >
            {invitadoAviso}
            <button
              onClick={() => setInvitadoAviso('')}
              aria-label="Cerrar aviso"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {!inDetail && activeTab === 'personal' && (
          loadingPersonal ? (
            <div style={{ padding: '32px 0', color: C.muted, fontFamily: 'Inter, sans-serif', fontSize: 14 }}>
              Cargando...
            </div>
          ) : errorPersonal ? (
            <div style={{ padding: '32px 0', fontFamily: 'Inter, sans-serif', fontSize: 14, color: C.red }}>
              {errorPersonal}
            </div>
          ) : (
            <>
              {quitarError && (
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.red, margin: '0 0 12px' }}>
                  {quitarError}
                </p>
              )}

              <Seccion titulo="Dueños de la marca" aclaracion="Tienen acceso a todas las sucursales. Los administra MenYU.">
                {(personal?.duenos ?? []).length === 0 ? (
                  <Vacio texto="Esta marca no tiene dueños cargados." />
                ) : (
                  personal?.duenos.map((d) => (
                    <MiembroRow
                      key={d.membresiaId}
                      miembro={d}
                      esPropia={d.usuarioId === perfil.id}
                      puedeQuitar={false}
                      onQuitar={() => undefined}
                    />
                  ))
                )}
              </Seccion>

              <Seccion titulo="Con acceso a este restaurante">
                {(personal?.miembros ?? []).length === 0 ? (
                  <Vacio texto="Todavía no invitaste a nadie a este restaurante." />
                ) : (
                  personal?.miembros.map((m) => (
                    <MiembroRow
                      key={m.membresiaId}
                      miembro={m}
                      esPropia={m.usuarioId === perfil.id}
                      puedeQuitar={!!rolActual && puedeQuitarAcceso(rolActual, m.rol)}
                      onQuitar={() => { setQuitarError(''); setPorQuitar(m) }}
                    />
                  ))
                )}
              </Seccion>

              {(personal?.sinCuenta ?? []).length > 0 && (
                <Seccion
                  titulo="Mozos sin cuenta"
                  aclaracion="Trabajaban con el inicio de sesión anterior. Invitalos para que entren con su cuenta."
                >
                  {personal?.sinCuenta.map((m) => (
                    <SinCuentaRow
                      key={m.mozoId}
                      mozo={m}
                      puedeInvitar={rolesOfrecidos.includes('MOZO')}
                      onInvitar={() => abrirInvitar({ email: m.email ?? '', nombre: m.nombre, rol: m.esJefeSalon ? 'JEFE_SALON' : 'MOZO' })}
                    />
                  ))}
                </Seccion>
              )}
            </>
          )
        )}

        {!inDetail && activeTab === 'mozos' && (
          loading ? (
            <div style={{ padding: '32px 0', color: C.muted, fontFamily: 'Inter, sans-serif', fontSize: 14 }}>
              Cargando...
            </div>
          ) : mozos.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              color: C.muted, fontFamily: 'Inter, sans-serif', fontSize: 14,
            }}>
              No hay mozos en este restaurante todavía.
            </div>
          ) : (
            mozos.map((mozo) => (
              <MozoRow
                key={mozo.id}
                mozo={mozo}
                mesas={mesasPorMozo.get(mozo.id) ?? []}
                llamadosHoy={llamadosPorMozo.get(mozo.id) ?? 0}
                onClick={() => handleSelectMozo(mozo)}
              />
            ))
          )
        )}

        {inDetail && selectedMozo && (
          <DetailContent
            mozo={selectedMozo}
            mesasDelMozo={mesasDelMozo}
            mesasDisponibles={mesasDisponibles}
            editExpanded={editExpanded}
            setEditExpanded={setEditExpanded}
            editNombre={editNombre}     setEditNombre={setEditNombre}
            editTelefono={editTelefono} setEditTelefono={setEditTelefono}
            editLoading={editLoading}
            editError={editError}
            onAssign={handleAssignMesa}
            onUnassign={handleUnassignMesa}
            onGuardar={handleGuardar}
            onEliminar={() => { setEliminarError(''); setConfirmEliminar(true) }}
            onCancelEdit={() => {
              setEditExpanded(false)
              setEditNombre(selectedMozo.nombre)
              setEditTelefono(selectedMozo.telefono ?? '')
              setEditError('')
            }}
            canEdit={isOwner}
            sinCuenta={mozosSinCuenta.has(selectedMozo.id)}
            eliminarError={eliminarError}
          />
        )}
      </div>

      {/* ── Modal: Confirmar quitar acceso ── */}
      <ModalConfirmar
        open={!!porQuitar}
        titulo="¿Quitarle el acceso?"
        mensaje={`${porQuitar?.nombre ?? 'Esta persona'} deja de entrar a este restaurante. Su cuenta no se borra: se la puede volver a invitar.`}
        labelConfirmar="Sí, quitar acceso"
        colorConfirmar={C.red}
        onConfirmar={() => { void ejecutarQuitarAcceso() }}
        onCancelar={() => setPorQuitar(null)}
      />

      {/* ── Modal: Confirmar eliminar mozo (solo sin cuenta) ── */}
      <ModalConfirmar
        open={confirmEliminar}
        titulo="¿Eliminar mozo?"
        mensaje="Esta acción no se puede deshacer. Se borra su perfil de mozo, que no tiene cuenta."
        labelConfirmar="Sí, eliminar"
        colorConfirmar={C.red}
        onConfirmar={() => { void ejecutarEliminar() }}
        onCancelar={() => setConfirmEliminar(false)}
      />

      {/* ── Modal: Confirmar quitar mesa ── */}
      <ModalConfirmar
        open={!!confirmQuitarMesa}
        titulo={`¿Quitar mesa ${confirmQuitarMesa?.numero ?? ''}?`}
        mensaje={`Se quitará la asignación de esta mesa para ${selectedMozo?.nombre ?? 'el mozo'}.`}
        labelConfirmar="Sí, quitar"
        colorConfirmar={C.orange}
        onConfirmar={() => { void ejecutarUnassignMesa() }}
        onCancelar={() => setConfirmQuitarMesa(null)}
      />

      {/* ── Modal: Invitar ── */}
      {showInvitar && (
        <ModalBase title="Invitar a alguien" onClose={() => setShowInvitar(false)}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.sub, marginBottom: 16, marginTop: -8 }}>
            Le llega un mail para elegir su contraseña. No hace falta cargarle ninguna.
          </p>
          <InputField label="Email" type="email" value={invitarEmail} onChange={setInvitarEmail} required />
          <InputField label="Nombre" value={invitarNombre} onChange={setInvitarNombre} required />
          <div style={{ marginBottom: 14 }}>
            <label
              htmlFor="invitar-rol"
              style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 5, fontFamily: 'Inter, sans-serif' }}
            >
              Rol<span style={{ color: C.red }}> *</span>
            </label>
            <select
              id="invitar-rol"
              value={invitarRol}
              onChange={(e) => setInvitarRol(e.target.value as Rol)}
              style={{
                width: '100%', border: `1px solid ${C.border}`, borderRadius: 8,
                padding: '9px 12px', fontSize: 14, fontFamily: 'Inter, sans-serif',
                color: C.text, outline: 'none', boxSizing: 'border-box', background: 'white',
              }}
            >
              {rolesOfrecidos.map((rol) => (
                <option key={rol} value={rol}>
                  {rol === 'OWNER' ? `${etiquetaDeRol(rol)} (toda la marca)` : etiquetaDeRol(rol)}
                </option>
              ))}
            </select>
          </div>
          {invitarError && (
            <div style={{ color: C.red, fontSize: 13, marginBottom: 14, fontFamily: 'Inter, sans-serif' }}>
              {invitarError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowInvitar(false)}
              style={{
                border: `1px solid ${C.border}`, borderRadius: 8, background: 'white',
                color: C.sub, fontFamily: 'Inter, sans-serif', fontSize: 13,
                padding: '8px 16px', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleInvitar()}
              disabled={invitarLoading}
              style={{
                border: 'none', borderRadius: 8, background: C.orange,
                color: 'white', fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                fontSize: 13, padding: '8px 16px', cursor: invitarLoading ? 'not-allowed' : 'pointer',
                opacity: invitarLoading ? 0.7 : 1,
              }}
            >
              {invitarLoading ? 'Enviando...' : 'Enviar invitación'}
            </button>
          </div>
        </ModalBase>
      )}

    </div>
  )
}

/* ── piezas de la lista de personal ─────────────────────────────────────────── */

function Seccion({ titulo, aclaracion, children }: { titulo: string; aclaracion?: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} style={{ marginBottom: 24 }}>
      <h3 style={{
        fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14,
        color: C.navy, margin: '0 0 4px',
      }}>
        {titulo}
      </h3>
      {aclaracion && (
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.sub, margin: '0 0 12px' }}>
          {aclaracion}
        </p>
      )}
      {!aclaracion && <div style={{ height: 12 }} />}
      {children}
    </section>
  )
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.muted, margin: 0 }}>
      {texto}
    </p>
  )
}
