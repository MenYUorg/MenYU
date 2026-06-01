import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronRight, Users, X } from 'lucide-react'
import { useAuth } from '@menyu/auth'
import { useContextStore } from '../../../store/contextStore'
import { api, ApiError } from '../../../services/api'

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

interface AdminItem {
  id: string
  email: string
  rol: string
  marcaId: string | null
}

type RestauranteAsignado = { id: string; nombre: string }

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

/* ── GerenteAvatar ──────────────────────────────────────────────────────────── */

function GerenteAvatar({ email, size = 40 }: { email: string; size?: number }) {
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

/* ── GerenteRow ─────────────────────────────────────────────────────────────── */

function GerenteRow({
  gerente, restaurantes, onClick,
}: {
  gerente: AdminItem; restaurantes: RestauranteAsignado[]; onClick: () => void
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
      <GerenteAvatar email={gerente.email} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: 'Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {gerente.email}
        </div>
        <div style={{ fontSize: 12, color: C.sub, fontFamily: 'Inter, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {restaurantes.length === 0
            ? 'Sin restaurantes asignados'
            : restaurantes.map((r) => r.nombre).join(', ')}
        </div>
      </div>
      <ChevronRight size={16} color={C.muted} />
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

/* ── GerenteRestauranteTile ─────────────────────────────────────────────────── */

function GerenteRestauranteTile({ restaurante, onAssign }: { restaurante: RestauranteAsignado; onAssign: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onAssign}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 8, border: `2px solid ${hov ? C.green : C.border}`,
        background: hov ? '#f0fdf4' : 'white',
        padding: '10px 14px', cursor: 'pointer',
        fontSize: 13, fontFamily: 'Inter, sans-serif', color: C.text, fontWeight: 500,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {restaurante.nombre}
    </div>
  )
}

/* ── DetailContent ──────────────────────────────────────────────────────────── */

function DetailContent({
  mozo, mesasDelMozo, mesasDisponibles,
  editExpanded, setEditExpanded,
  editNombre, setEditNombre,
  editEmail, setEditEmail,
  editPassword, setEditPassword,
  editLoading, editError,
  onAssign, onUnassign, onGuardar, onEliminar, onCancelEdit,
  canEdit, eliminarError,
}: {
  mozo: MozoItem
  mesasDelMozo: MesaAsignada[]
  mesasDisponibles: MesaConMozos[]
  editExpanded: boolean
  setEditExpanded: (v: boolean) => void
  editNombre: string; setEditNombre: (v: string) => void
  editEmail: string; setEditEmail: (v: string) => void
  editPassword: string; setEditPassword: (v: string) => void
  editLoading: boolean; editError: string
  onAssign: (mesa: MesaConMozos) => void
  onUnassign: (mesa: MesaAsignada) => void
  onGuardar: () => void
  onEliminar: () => void
  onCancelEdit: () => void
  canEdit: boolean
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
          <InputField label="Email" type="email" value={editEmail} onChange={setEditEmail} />
          <InputField
            label="Nueva contraseña"
            type="password"
            value={editPassword}
            onChange={setEditPassword}
            placeholder="Dejar vacío para no cambiar"
          />

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

/* ── GerenteDetailContent ───────────────────────────────────────────────────── */

function GerenteDetailContent({
  restaurantesAsignados, restaurantesDisponibles,
  editExpanded, setEditExpanded,
  editEmail, setEditEmail,
  editPassword, setEditPassword,
  editLoading, editError,
  onGuardar, onEliminar, onCancelEdit, onAsignar, onQuitar,
  canEdit, eliminarError,
}: {
  gerente: AdminItem
  restaurantesAsignados: RestauranteAsignado[]
  restaurantesDisponibles: RestauranteAsignado[]
  editExpanded: boolean
  setEditExpanded: (v: boolean) => void
  editEmail: string; setEditEmail: (v: string) => void
  editPassword: string; setEditPassword: (v: string) => void
  editLoading: boolean; editError: string
  onGuardar: () => void
  onEliminar: () => void
  onCancelEdit: () => void
  onAsignar: (r: RestauranteAsignado) => void
  onQuitar: (r: RestauranteAsignado) => void
  canEdit: boolean
  eliminarError: string
}) {
  return (
    <div>
      {/* Panel restaurantes */}
      <div style={{
        background: 'white', border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 20, marginBottom: 16,
      }}>
        <div style={{
          fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
          fontSize: 15, color: C.navy, marginBottom: 20,
        }}>
          Acceso a restaurantes
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Izquierda: asignados */}
          <div>
            <div style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: C.sub, fontFamily: 'Inter, sans-serif', fontWeight: 600, marginBottom: 12,
            }}>
              Acceso actual
            </div>
            {restaurantesAsignados.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, fontFamily: 'Inter, sans-serif', padding: '12px 0' }}>
                Sin restaurantes asignados
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {restaurantesAsignados.map((r) => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: 8, padding: '10px 12px',
                  }}>
                    <span style={{ fontSize: 13, fontFamily: 'Inter, sans-serif', color: C.text, fontWeight: 500 }}>
                      {r.nombre}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => onQuitar(r)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: C.red, fontSize: 11, fontFamily: 'Inter, sans-serif', padding: '0 4px',
                        }}
                      >
                        × quitar
                      </button>
                    )}
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
              Agregar acceso
            </div>
            {!canEdit ? (
              <div style={{ color: C.muted, fontSize: 13, fontFamily: 'Inter, sans-serif', padding: '12px 0' }}>
                —
              </div>
            ) : restaurantesDisponibles.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, fontFamily: 'Inter, sans-serif', padding: '12px 0' }}>
                Sin restaurantes disponibles
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {restaurantesDisponibles.map((r) => (
                  <GerenteRestauranteTile key={r.id} restaurante={r} onAssign={() => onAsignar(r)} />
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
          ⚙ Editar datos del gerente
        </button>
      )}

      {canEdit && editExpanded && (
        <div style={{
          background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: 20, marginTop: 12,
        }}>
          <InputField label="Email" type="email" value={editEmail} onChange={setEditEmail} />
          <InputField
            label="Nueva contraseña"
            type="password"
            value={editPassword}
            onChange={setEditPassword}
            placeholder="Dejar vacío para no cambiar"
          />

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
            <button
              onClick={onEliminar}
              style={{
                border: `1px solid ${C.red}`, borderRadius: 8, background: 'white',
                color: C.red, fontFamily: 'Inter, sans-serif', fontWeight: 600,
                fontSize: 13, padding: '8px 16px', cursor: 'pointer',
              }}
            >
              Eliminar gerente
            </button>
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

export function MozosPage() {
  const { user } = useAuth()
  const isOwner = user?.rol === 'OWNER' || user?.rol === 'ROOT'
  const { selectedRestauranteId, restaurantes: todosRestaurantes } = useContextStore()

  // ── Mozos state ────────────────────────────────────────────────────────────
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

  // Crear mozo
  const [showCrearMozo,  setShowCrearMozo]  = useState(false)
  const [crearNombre,    setCrearNombre]    = useState('')
  const [crearEmail,     setCrearEmail]     = useState('')
  const [crearPassword,  setCrearPassword]  = useState('')
  const [crearLoading,   setCrearLoading]   = useState(false)
  const [crearError,     setCrearError]     = useState('')

  // Editar mozo
  const [editNombre,   setEditNombre]   = useState('')
  const [editEmail,    setEditEmail]    = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editLoading,  setEditLoading]  = useState(false)
  const [editError,    setEditError]    = useState('')

  // ── Gerentes state ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'mozos' | 'gerentes'>('mozos')

  const [gerentes,              setGerentes]              = useState<AdminItem[]>([])
  const [restaurantesPorGerente, setRestaurantesPorGerente] = useState<Map<string, RestauranteAsignado[]>>(new Map())
  const [loadingGerentes,       setLoadingGerentes]       = useState(false)

  const [selectedGerente,        setSelectedGerente]        = useState<AdminItem | null>(null)
  const [restaurantesDelGerente, setRestaurantesDelGerente] = useState<RestauranteAsignado[]>([])
  const [gerenteEditExpanded,    setGerenteEditExpanded]    = useState(false)
  const [gerenteEditEmail,       setGerenteEditEmail]       = useState('')
  const [gerenteEditPassword,    setGerenteEditPassword]    = useState('')
  const [gerenteEditLoading,     setGerenteEditLoading]     = useState(false)
  const [gerenteEditError,       setGerenteEditError]       = useState('')
  const [confirmEliminarGerente,    setConfirmEliminarGerente]    = useState(false)
  const [confirmQuitarRestaurante,  setConfirmQuitarRestaurante]  = useState<RestauranteAsignado | null>(null)
  const [eliminarGerenteError,      setEliminarGerenteError]      = useState('')

  // Crear gerente
  const [showCrearGerente,  setShowCrearGerente]  = useState(false)
  const [gerenteNombre,     setGerenteNombre]     = useState('')
  const [gerenteEmail,      setGerenteEmail]      = useState('')
  const [gerentePassword,   setGerentePassword]   = useState('')
  const [gerenteLoading,    setGerenteLoading]    = useState(false)
  const [gerenteError,      setGerenteError]      = useState('')
  const [gerenteSuccess,    setGerenteSuccess]    = useState(false)

  /* ── data loading ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!selectedRestauranteId) return
    void loadData(selectedRestauranteId)
  }, [selectedRestauranteId])

  useEffect(() => {
    if (activeTab === 'gerentes' && isOwner) {
      void loadGerentes()
    }
  }, [activeTab, isOwner])

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

  async function loadGerentes() {
    setLoadingGerentes(true)
    try {
      const list = await api.admins.list()
      const gerentesList = list.filter((a) => a.rol === 'GERENTE')
      setGerentes(gerentesList)

      const perGerente = await Promise.allSettled(
        gerentesList.map(async (g) => {
          const rels = await api.adminRestaurante.porAdmin(g.id)
          return {
            gerenteId: g.id,
            restaurantes: rels.map((r) => ({ id: r.restauranteId, nombre: r.restaurante.nombre })),
          }
        }),
      )

      const map = new Map<string, RestauranteAsignado[]>()
      for (const result of perGerente) {
        if (result.status === 'fulfilled') {
          map.set(result.value.gerenteId, result.value.restaurantes)
        }
      }
      setRestaurantesPorGerente(map)
    } finally {
      setLoadingGerentes(false)
    }
  }

  /* ── select mozo ─────────────────────────────────────────────────────────── */

  function handleSelectMozo(mozo: MozoItem) {
    setSelectedMozo(mozo)
    setMesasDelMozo(mesasPorMozo.get(mozo.id) ?? [])
    setEditExpanded(false)
    setEditNombre(mozo.nombre)
    setEditEmail(mozo.email ?? '')
    setEditPassword('')
    setEditError('')
  }

  /* ── select gerente ──────────────────────────────────────────────────────── */

  function handleSelectGerente(g: AdminItem) {
    setSelectedGerente(g)
    setRestaurantesDelGerente(restaurantesPorGerente.get(g.id) ?? [])
    setGerenteEditExpanded(false)
    setGerenteEditEmail(g.email)
    setGerenteEditPassword('')
    setGerenteEditError('')
    setEliminarGerenteError('')
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
        email: editEmail || undefined,
        password: editPassword || undefined,
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
    } catch (e) {
      setEliminarError(e instanceof ApiError ? e.message : 'Error al eliminar mozo')
    }
  }

  /* ── edit gerente ────────────────────────────────────────────────────────── */

  async function handleGuardarGerente() {
    if (!selectedGerente) return
    setGerenteEditLoading(true)
    setGerenteEditError('')
    try {
      const updated = await api.admins.update(selectedGerente.id, {
        email: gerenteEditEmail || undefined,
        password: gerenteEditPassword || undefined,
      })
      const newGerente: AdminItem = { ...selectedGerente, email: updated.email }
      setSelectedGerente(newGerente)
      setGerentes((prev) => prev.map((g) => (g.id === updated.id ? newGerente : g)))
      setGerenteEditExpanded(false)
    } catch (e) {
      setGerenteEditError(e instanceof ApiError ? e.message : 'Error al guardar')
    } finally {
      setGerenteEditLoading(false)
    }
  }

  async function ejecutarEliminarGerente() {
    if (!selectedGerente) return
    setConfirmEliminarGerente(false)
    setEliminarGerenteError('')
    try {
      await api.admins.delete(selectedGerente.id)
      setGerentes((prev) => prev.filter((g) => g.id !== selectedGerente.id))
      setSelectedGerente(null)
    } catch (e) {
      setEliminarGerenteError(e instanceof ApiError ? e.message : 'Error al eliminar gerente')
    }
  }

  /* ── restaurante assign / unassign ──────────────────────────────────────── */

  async function handleAsignarRestaurante(r: RestauranteAsignado) {
    if (!selectedGerente) return
    try {
      await api.adminRestaurante.asignar(selectedGerente.id, r.id)
      const nuevos = [...restaurantesDelGerente, r]
      setRestaurantesDelGerente(nuevos)
      setRestaurantesPorGerente((prev) => new Map(prev).set(selectedGerente.id, nuevos))
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : 'Error al asignar restaurante')
    }
  }

  function handleQuitarRestaurante(r: RestauranteAsignado) {
    setConfirmQuitarRestaurante(r)
  }

  async function ejecutarQuitarRestaurante() {
    if (!selectedGerente || !confirmQuitarRestaurante) return
    const r = confirmQuitarRestaurante
    setConfirmQuitarRestaurante(null)
    try {
      await api.adminRestaurante.desasignar(selectedGerente.id, r.id)
      const nuevos = restaurantesDelGerente.filter((x) => x.id !== r.id)
      setRestaurantesDelGerente(nuevos)
      setRestaurantesPorGerente((prev) => new Map(prev).set(selectedGerente.id, nuevos))
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : 'Error al quitar restaurante')
    }
  }

  /* ── crear mozo ──────────────────────────────────────────────────────────── */

  function resetCrearForm() {
    setCrearNombre(''); setCrearEmail(''); setCrearPassword('')
    setCrearError('')
  }

  async function handleCrearMozo() {
    if (!selectedRestauranteId || !crearNombre || !crearEmail || !crearPassword) {
      setCrearError('Completá todos los campos requeridos')
      return
    }
    setCrearLoading(true)
    setCrearError('')
    try {
      const mozo = await api.mozos.create({
        restauranteId: selectedRestauranteId,
        nombre: crearNombre, email: crearEmail,
        password: crearPassword, esJefeSalon: false,
      })
      setMozos((prev) => [...prev, mozo])
      setMesasPorMozo((prev) => new Map(prev).set(mozo.id, []))
      setLlamadosPorMozo((prev) => new Map(prev).set(mozo.id, 0))
      setShowCrearMozo(false)
      resetCrearForm()
    } catch (e) {
      setCrearError(e instanceof ApiError ? e.message : 'Error al crear mozo')
    } finally {
      setCrearLoading(false)
    }
  }

  /* ── crear gerente ───────────────────────────────────────────────────────── */

  function resetGerenteForm() {
    setGerenteNombre(''); setGerenteEmail(''); setGerentePassword('')
    setGerenteError(''); setGerenteSuccess(false)
  }

  async function handleCrearGerente() {
    if (!selectedRestauranteId || !gerenteNombre || !gerenteEmail || !gerentePassword) {
      setGerenteError('Completá todos los campos requeridos')
      return
    }
    setGerenteLoading(true)
    setGerenteError('')
    try {
      await api.admins.create({
        nombre: gerenteNombre,
        email: gerenteEmail,
        password: gerentePassword,
        restauranteId: selectedRestauranteId,
      })
      setGerenteSuccess(true)
      setTimeout(() => {
        setShowCrearGerente(false)
        resetGerenteForm()
        setActiveTab('gerentes')
      }, 1500)
    } catch (e) {
      setGerenteError(e instanceof ApiError ? e.message : 'Error al crear gerente')
    } finally {
      setGerenteLoading(false)
    }
  }

  /* ── memos ───────────────────────────────────────────────────────────────── */

  const mesasDisponibles = useMemo(() => {
    const ids = new Set(mesasDelMozo.map((m) => m.id))
    return todasLasMesas.filter((m) => !ids.has(m.id))
  }, [mesasDelMozo, todasLasMesas])

  const restaurantesDisponiblesParaGerente = useMemo(() => {
    const ids = new Set(restaurantesDelGerente.map((r) => r.id))
    return todosRestaurantes
      .filter((r) => !ids.has(r.id))
      .map((r) => ({ id: r.id, nombre: r.nombre }))
  }, [restaurantesDelGerente, todosRestaurantes])

  /* ── render ──────────────────────────────────────────────────────────────── */

  if (!selectedRestauranteId) {
    return (
      <div style={{ padding: '32px 28px', color: C.sub, fontFamily: 'Inter, sans-serif', fontSize: 14 }}>
        Seleccioná un restaurante para ver los mozos.
      </div>
    )
  }

  const inDetail = !!selectedMozo || !!selectedGerente

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
                  {activeTab === 'gerentes' && isOwner ? 'Gerentes' : 'Mozos'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {isOwner && activeTab === 'gerentes' && (
                  <button
                    onClick={() => setShowCrearGerente(true)}
                    style={{
                      border: `1px solid ${C.navy}`, borderRadius: 8, background: 'white',
                      color: C.navy, fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                      fontSize: 13, padding: '8px 16px', cursor: 'pointer',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.navyBg }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'white' }}
                  >
                    + Crear gerente
                  </button>
                )}
                {isOwner && activeTab === 'mozos' && (
                  <button
                    onClick={() => setShowCrearMozo(true)}
                    style={{
                      border: 'none', borderRadius: 8, background: C.orange,
                      color: 'white', fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                      fontSize: 13, padding: '8px 14px', cursor: 'pointer',
                    }}
                  >
                    + Agregar mozo
                  </button>
                )}
              </div>
            </div>

            {/* Tab bar — solo para OWNER/ROOT */}
            {isOwner && (
              <div style={{
                display: 'flex', gap: 2, marginBottom: 8,
                background: C.bg, borderRadius: 10, padding: 4,
                width: 'fit-content',
              }}>
                {(['mozos', 'gerentes'] as const).map((tab) => (
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
                    {tab === 'mozos' ? 'Mozos' : 'Gerentes'}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => {
                if (selectedMozo) setSelectedMozo(null)
                else setSelectedGerente(null)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.sub, fontFamily: 'Inter, sans-serif', fontSize: 13,
                padding: 0, marginBottom: 10,
              }}
            >
              <ArrowLeft size={14} />
              {selectedMozo ? 'Mozos' : 'Gerentes'}
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

            {selectedGerente && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <GerenteAvatar email={selectedGerente.email} size={52} />
                <div>
                  <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 22, color: C.navy }}>
                    {selectedGerente.email}
                  </span>
                  <div style={{ fontSize: 12, color: C.sub, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                    Gerente
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 28px' }}>
        {!inDetail ? (
          activeTab === 'mozos' || !isOwner ? (
            // ── Lista de mozos ──
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
          ) : (
            // ── Lista de gerentes ──
            loadingGerentes ? (
              <div style={{ padding: '32px 0', color: C.muted, fontFamily: 'Inter, sans-serif', fontSize: 14 }}>
                Cargando...
              </div>
            ) : gerentes.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                color: C.muted, fontFamily: 'Inter, sans-serif', fontSize: 14,
              }}>
                No hay gerentes creados todavía.
              </div>
            ) : (
              gerentes.map((g) => (
                <GerenteRow
                  key={g.id}
                  gerente={g}
                  restaurantes={restaurantesPorGerente.get(g.id) ?? []}
                  onClick={() => handleSelectGerente(g)}
                />
              ))
            )
          )
        ) : selectedMozo ? (
          // ── Detalle de mozo ──
          <DetailContent
            mozo={selectedMozo}
            mesasDelMozo={mesasDelMozo}
            mesasDisponibles={mesasDisponibles}
            editExpanded={editExpanded}
            setEditExpanded={setEditExpanded}
            editNombre={editNombre}    setEditNombre={setEditNombre}
            editEmail={editEmail}      setEditEmail={setEditEmail}
            editPassword={editPassword} setEditPassword={setEditPassword}
            editLoading={editLoading}
            editError={editError}
            onAssign={handleAssignMesa}
            onUnassign={handleUnassignMesa}
            onGuardar={handleGuardar}
            onEliminar={() => { setEliminarError(''); setConfirmEliminar(true) }}
            onCancelEdit={() => {
              setEditExpanded(false)
              setEditNombre(selectedMozo.nombre)
              setEditEmail(selectedMozo.email ?? '')
              setEditPassword('')
              setEditError('')
            }}
            canEdit={isOwner}
            eliminarError={eliminarError}
          />
        ) : selectedGerente ? (
          // ── Detalle de gerente ──
          <GerenteDetailContent
            gerente={selectedGerente}
            restaurantesAsignados={restaurantesDelGerente}
            restaurantesDisponibles={restaurantesDisponiblesParaGerente}
            editExpanded={gerenteEditExpanded}
            setEditExpanded={setGerenteEditExpanded}
            editEmail={gerenteEditEmail}
            setEditEmail={setGerenteEditEmail}
            editPassword={gerenteEditPassword}
            setEditPassword={setGerenteEditPassword}
            editLoading={gerenteEditLoading}
            editError={gerenteEditError}
            onGuardar={handleGuardarGerente}
            onEliminar={() => { setEliminarGerenteError(''); setConfirmEliminarGerente(true) }}
            onCancelEdit={() => {
              setGerenteEditExpanded(false)
              setGerenteEditEmail(selectedGerente.email)
              setGerenteEditPassword('')
              setGerenteEditError('')
            }}
            onAsignar={handleAsignarRestaurante}
            onQuitar={handleQuitarRestaurante}
            canEdit={isOwner}
            eliminarError={eliminarGerenteError}
          />
        ) : null}
      </div>

      {/* ── Modal: Confirmar eliminar mozo ── */}
      <ModalConfirmar
        open={confirmEliminar}
        titulo="¿Eliminar mozo?"
        mensaje="Esta acción no se puede deshacer. El mozo perderá acceso al sistema."
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

      {/* ── Modal: Confirmar eliminar gerente ── */}
      <ModalConfirmar
        open={confirmEliminarGerente}
        titulo="¿Eliminar gerente?"
        mensaje="Esta acción no se puede deshacer. El gerente perderá acceso al sistema."
        labelConfirmar="Sí, eliminar"
        colorConfirmar={C.red}
        onConfirmar={() => { void ejecutarEliminarGerente() }}
        onCancelar={() => setConfirmEliminarGerente(false)}
      />

      {/* ── Modal: Confirmar quitar restaurante ── */}
      <ModalConfirmar
        open={!!confirmQuitarRestaurante}
        titulo={`¿Quitar acceso a ${confirmQuitarRestaurante?.nombre ?? ''}?`}
        mensaje={`${selectedGerente?.email ?? 'El gerente'} ya no podrá administrar este restaurante.`}
        labelConfirmar="Sí, quitar"
        colorConfirmar={C.orange}
        onConfirmar={() => { void ejecutarQuitarRestaurante() }}
        onCancelar={() => setConfirmQuitarRestaurante(null)}
      />

      {/* ── Modal: Crear gerente ── */}
      {showCrearGerente && (
        <ModalBase title="Nuevo gerente" onClose={() => { setShowCrearGerente(false); resetGerenteForm() }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.sub, marginBottom: 16, marginTop: -8 }}>
            El gerente podrá acceder al panel de administración con permisos limitados.
          </p>
          <InputField label="Nombre" value={gerenteNombre} onChange={setGerenteNombre} required />
          <InputField label="Email" type="email" value={gerenteEmail} onChange={setGerenteEmail} required />
          <InputField label="Contraseña" type="password" value={gerentePassword} onChange={setGerentePassword} required />
          {gerenteError && (
            <div style={{ color: C.red, fontSize: 13, marginBottom: 14, fontFamily: 'Inter, sans-serif' }}>
              {gerenteError}
            </div>
          )}
          {gerenteSuccess && (
            <div style={{ color: C.green, fontSize: 13, marginBottom: 14, fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              Gerente creado correctamente
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowCrearGerente(false); resetGerenteForm() }}
              style={{
                border: `1px solid ${C.border}`, borderRadius: 8, background: 'white',
                color: C.sub, fontFamily: 'Inter, sans-serif', fontSize: 13,
                padding: '8px 16px', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleCrearGerente()}
              disabled={gerenteLoading || gerenteSuccess}
              style={{
                border: 'none', borderRadius: 8, background: C.navy,
                color: 'white', fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                fontSize: 13, padding: '8px 16px', cursor: gerenteLoading || gerenteSuccess ? 'not-allowed' : 'pointer',
                opacity: gerenteLoading || gerenteSuccess ? 0.7 : 1,
              }}
            >
              {gerenteLoading ? 'Creando...' : 'Crear gerente'}
            </button>
          </div>
        </ModalBase>
      )}

      {/* ── Modal: Crear mozo ── */}
      {showCrearMozo && (
        <ModalBase title="Nuevo mozo" onClose={() => { setShowCrearMozo(false); resetCrearForm() }}>
          <InputField label="Nombre" value={crearNombre} onChange={setCrearNombre} required />
          <InputField label="Email" type="email" value={crearEmail} onChange={setCrearEmail} required />
          <InputField label="Contraseña" type="password" value={crearPassword} onChange={setCrearPassword} required />
          {crearError && (
            <div style={{ color: C.red, fontSize: 13, marginBottom: 14, fontFamily: 'Inter, sans-serif' }}>
              {crearError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowCrearMozo(false); resetCrearForm() }}
              style={{
                border: `1px solid ${C.border}`, borderRadius: 8, background: 'white',
                color: C.sub, fontFamily: 'Inter, sans-serif', fontSize: 13,
                padding: '8px 16px', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleCrearMozo()}
              disabled={crearLoading}
              style={{
                border: 'none', borderRadius: 8, background: C.orange,
                color: 'white', fontFamily: 'Montserrat, sans-serif', fontWeight: 700,
                fontSize: 13, padding: '8px 16px', cursor: 'pointer',
                opacity: crearLoading ? 0.7 : 1,
              }}
            >
              {crearLoading ? 'Creando...' : 'Crear mozo'}
            </button>
          </div>
        </ModalBase>
      )}

    </div>
  )
}
