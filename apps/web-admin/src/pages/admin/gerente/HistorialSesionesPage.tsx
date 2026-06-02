import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@menyu/auth'
import { useContextStore } from '../../../store/contextStore'
import { api } from '../../../services/api'
import type { SesionHistorial } from '../../../services/api'
import { Clock, ClipboardList, DollarSign, ChevronRight, X, ChevronDown, ChevronUp, Edit, XCircle } from 'lucide-react'

/* ── types ───────────────────────────────────────────────────────────────── */
type Period = 'hoy' | 'ayer' | 'semana' | 'mes'
type SesionPedido = SesionHistorial['pedidos'][number]

interface PedidoParaEditar {
  id: string
  items: { id: string; nombre: string; cantidad: number; cantidadEditada: number | null; precioUnitario: number }[]
}

const PERIOD_LABELS: Record<Period, string> = {
  hoy:    'Hoy',
  ayer:   'Ayer',
  semana: 'Última semana',
  mes:    'Último mes',
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getPeriodBounds = (period: Period): { desde: string; hasta: string } => {
  const now = new Date()
  const hoy = toLocalDateStr(now)
  const offset = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    return toLocalDateStr(d)
  }
  switch (period) {
    case 'ayer':   return { desde: offset(1), hasta: offset(1) }
    case 'semana': return { desde: offset(6), hasta: hoy }
    case 'mes':    return { desde: offset(29), hasta: hoy }
    default:       return { desde: hoy, hasta: hoy }
  }
}

function calcDuracion(iniciadaEn: string, cerradaEn: string): string {
  const totalMin = Math.floor(
    (new Date(cerradaEn).getTime() - new Date(iniciadaEn).getTime()) / 60000,
  )
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}

function shortId(id: string): string {
  return '#' + id.slice(0, 4).toUpperCase()
}

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

/* ── StepBtn ─────────────────────────────────────────────────────────────── */
function StepBtn({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width:          28,
        height:         28,
        borderRadius:   '50%',
        border:         `1px solid ${disabled ? '#E5E7EB' : '#D1D5DB'}`,
        background:     disabled ? '#F9FAFB' : hovered ? '#EEF0F8' : 'white',
        color:          disabled ? '#D1D5DB' : '#374151',
        fontFamily:     'Montserrat, sans-serif',
        fontWeight:     700,
        fontSize:       16,
        lineHeight:     1,
        cursor:         disabled ? 'not-allowed' : 'pointer',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        transition:     'background 0.12s',
      }}
    >
      {label}
    </button>
  )
}

/* ── EditModal ───────────────────────────────────────────────────────────── */
function EditModal({
  pedido,
  onClose,
  onDone,
}: {
  pedido: PedidoParaEditar
  onClose: () => void
  onDone: () => void
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(pedido.items.map((i) => [i.id, i.cantidadEditada ?? i.cantidad])),
  )
  const [justificacion, setJustificacion] = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  const words = countWords(justificacion)

  const ediciones = pedido.items
    .filter((item) => quantities[item.id] !== (item.cantidadEditada ?? item.cantidad))
    .map((item) => ({ pedidoItemId: item.id, cantidadNueva: quantities[item.id] }))

  const hasChanges    = ediciones.length > 0
  const todosAnulados = pedido.items.every((item) => quantities[item.id] === 0)
  const canSubmit     = hasChanges && justificacion.trim().length > 0 && words <= 50 && !submitting

  function setQty(id: string, val: number) {
    setQuantities((prev) => ({ ...prev, [id]: val }))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await api.pedidos.editar(pedido.id, { justificacion: justificacion.trim(), ediciones })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al editar pedido')
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         1000,
        background:     'rgba(45,53,97,0.55)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background:   'white',
          borderRadius: 16,
          width:        '100%',
          maxWidth:     500,
          padding:      24,
          boxShadow:    '0 24px 60px rgba(31,35,51,0.30)',
          maxHeight:    '90vh',
          overflowY:    'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, color: '#2D3561', margin: 0 }}>
            Editar pedido {shortId(pedido.id)}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 16px' }}>
          Ajustá la cantidad de cada ítem. Solo se registran los ítems que cambian.
        </p>

        {/* Item rows */}
        <div style={{ marginBottom: 16 }}>
          {pedido.items.map((item) => {
            const max     = item.cantidadEditada ?? item.cantidad
            const current = quantities[item.id]
            const changed = current !== max
            const anulado = current === 0

            let rowBg     = 'transparent'
            let rowBorder = '1px solid transparent'
            if (changed && anulado) { rowBg = '#FEE2E2'; rowBorder = '1px solid #FECACA' }
            else if (changed)       { rowBg = '#FDF0ED'; rowBorder = '1px solid #F6C4B8' }

            return (
              <div
                key={item.id}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          12,
                  padding:      '8px 10px',
                  borderRadius: 8,
                  background:   rowBg,
                  border:       rowBorder,
                  marginBottom: 4,
                  transition:   'background 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily:     'Inter, sans-serif',
                      fontSize:       13,
                      color:          anulado ? '#DC2626' : '#374151',
                      textDecoration: anulado ? 'line-through' : 'none',
                    }}
                  >
                    {item.nombre}
                  </span>
                  {anulado && (
                    <div>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, color: '#DC2626' }}>
                        Ítem anulado
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StepBtn
                    label="−"
                    onClick={() => setQty(item.id, Math.max(0, current - 1))}
                    disabled={current === 0}
                  />
                  <span
                    style={{
                      fontFamily: 'Montserrat, sans-serif',
                      fontWeight: 700,
                      fontSize:   14,
                      color:      anulado ? '#E8563A' : '#2D3561',
                      minWidth:   20,
                      textAlign:  'center',
                    }}
                  >
                    {current}
                  </span>
                  <StepBtn
                    label="+"
                    onClick={() => setQty(item.id, Math.min(max, current + 1))}
                    disabled={current === max}
                  />
                </div>
                <span
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize:   12,
                    color:      '#6B7280',
                    minWidth:   56,
                    textAlign:  'right',
                    flexShrink: 0,
                  }}
                >
                  ${(current * item.precioUnitario).toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Justificación */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#374151' }}>
              Justificación
            </label>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: words > 50 ? '#E8563A' : '#9CA3AF' }}>
              {words}/50 palabras
            </span>
          </div>
          <textarea
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            rows={3}
            placeholder="Describí el motivo de la edición…"
            style={{
              width:        '100%',
              padding:      '10px 12px',
              borderRadius: 8,
              border:       `1px solid ${words > 50 ? '#E8563A' : '#D1D5DB'}`,
              fontFamily:   'Inter, sans-serif',
              fontSize:     13,
              color:        '#374151',
              resize:       'vertical',
              outline:      'none',
              boxSizing:    'border-box',
            }}
          />
        </div>

        {hasChanges && todosAnulados && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, padding: '8px 12px', margin: '0 0 12px' }}>
            Esto anulará el pedido completo.
          </p>
        )}

        {error && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#E8563A', margin: '0 0 12px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding:      '8px 16px',
              borderRadius: 8,
              border:       'none',
              background:   canSubmit ? '#E8563A' : '#D1D5DB',
              fontFamily:   'Inter, sans-serif',
              fontSize:     13,
              fontWeight:   600,
              color:        canSubmit ? 'white' : '#9CA3AF',
              cursor:       canSubmit ? 'pointer' : 'not-allowed',
              transition:   'background 0.15s',
            }}
          >
            {submitting ? 'Guardando…' : 'Guardar edición'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── BadgeEstado ─────────────────────────────────────────────────────────── */
function BadgeEstado({ estado }: { estado: string }) {
  const MAP: Record<string, { bg: string; color: string; label: string }> = {
    entregado:      { bg: '#f3f4f6', color: '#6b7280', label: 'Entregado' },
    anulado:        { bg: '#fef2f2', color: '#dc2626', label: 'Anulado' },
    pendiente:      { bg: '#FFF7ED', color: '#D97706', label: 'Pendiente' },
    en_preparacion: { bg: '#EFF6FF', color: '#2563EB', label: 'En preparación' },
    listo:          { bg: '#ECFDF5', color: '#059669', label: 'Listo' },
  }
  const s = MAP[estado] ?? { bg: '#f3f4f6', color: '#6b7280', label: estado }
  return (
    <span
      style={{
        background:   s.bg,
        color:        s.color,
        fontFamily:   'Inter, sans-serif',
        fontWeight:   600,
        fontSize:     11,
        padding:      '3px 8px',
        borderRadius: 20,
        flexShrink:   0,
      }}
    >
      {s.label}
    </span>
  )
}

/* ── PedidoEnSesion ──────────────────────────────────────────────────────── */
function PedidoEnSesion({
  pedido,
  canEdit,
  onEdit,
}: {
  pedido: SesionPedido
  canEdit: boolean
  onEdit: (p: PedidoParaEditar) => void
}) {
  const [showEdiciones, setShowEdiciones] = useState(false)
  const isAnulado = pedido.estado === 'anulado'

  const borderLeft = pedido.tieneEdiciones
    ? '3px solid #E8563A'
    : isAnulado
      ? '3px solid #dc2626'
      : '3px solid transparent'

  function handleEdit() {
    onEdit({
      id:    pedido.id,
      items: pedido.items.map((i) => ({
        id:              i.id,
        nombre:          i.itemNombre,
        cantidad:        i.cantidad,
        cantidadEditada: i.cantidadEditada,
        precioUnitario:  i.precioUnitario,
      })),
    })
  }

  return (
    <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, borderLeft }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 13, color: '#2D3561', flex: 1 }}>
          {shortId(pedido.id)}
        </span>
        <BadgeEstado estado={pedido.estado} />
        {pedido.tieneEdiciones && !isAnulado && (
          <span style={{ background: '#FDE5DF', color: '#E8563A', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 11, padding: '3px 8px', borderRadius: 20 }}>
            Editado
          </span>
        )}
        {isAnulado && (
          <span style={{ background: '#fef2f2', color: '#dc2626', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 11, padding: '3px 8px', borderRadius: 20 }}>
            Anulado
          </span>
        )}
      </div>

      {/* Items */}
      <div style={{ marginTop: 8 }}>
        {pedido.items.map((item) => {
          const cantidadOriginal = item.cantidad
          const cantidadEditada  = item.cantidadEditada ?? cantidadOriginal
          const cantidadQuitada  = cantidadOriginal - cantidadEditada

          return (
            <div key={item.id} style={{ padding: '3px 0' }}>
              {cantidadEditada === 0 ? (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626', textDecoration: 'line-through' }}>
                  {cantidadOriginal}× {item.itemNombre}
                </span>
              ) : cantidadQuitada > 0 ? (
                <>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>
                    {cantidadEditada}× {item.itemNombre}
                  </span>
                  <div>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#DC2626', textDecoration: 'line-through' }}>
                      {cantidadQuitada}× {item.itemNombre}
                    </span>
                  </div>
                </>
              ) : (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#374151' }}>
                  {cantidadOriginal}× {item.itemNombre}
                </span>
              )}

              {cantidadEditada > 0 && item.mods.length > 0 && (
                <div style={{ marginTop: 2 }}>
                  {item.mods.map((mod, i) => (
                    <div
                      key={i}
                      style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize:   11,
                        color:      mod.accion.toLowerCase() === 'quitar' ? '#DC2626' : '#059669',
                        marginTop:  2,
                      }}
                    >
                      {mod.accion.toLowerCase() === 'quitar'
                        ? `sin ${mod.ingredienteNombre}`
                        : `+ ${mod.ingredienteNombre}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {pedido.tieneEdiciones && (
            <button
              onClick={() => setShowEdiciones((v) => !v)}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          4,
                background:   'none',
                border:       '1px solid #FECACA',
                borderRadius: 6,
                padding:      '5px 10px',
                fontFamily:   'Inter, sans-serif',
                fontSize:     12,
                color:        '#E8563A',
                cursor:       'pointer',
              }}
            >
              {showEdiciones ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              Ver ediciones ({pedido.ediciones.length})
            </button>
          )}
          {canEdit && !isAnulado && (
            <button
              onClick={handleEdit}
              style={{
                background:   'none',
                border:       '1px solid #e5e7eb',
                borderRadius: 6,
                padding:      '5px 10px',
                fontFamily:   'Inter, sans-serif',
                fontSize:     12,
                color:        '#E8563A',
                cursor:       'pointer',
              }}
            >
              Editar pedido
            </button>
          )}
        </div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 14, color: '#2D3561' }}>
          ${pedido.totalPedido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* Ediciones panel */}
      {showEdiciones && pedido.ediciones.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {pedido.ediciones.map((ed) => (
            <div
              key={ed.id}
              style={{
                borderLeft:   '3px solid #E8563A',
                background:   'white',
                borderRadius: 6,
                padding:      10,
                marginTop:    8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  {ed.editor.nombre} · {ed.editor.tipo}
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#9CA3AF' }}>
                  {fmtDate(ed.creadoEn)} {fmtTime(ed.creadoEn)}
                </span>
              </div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 8px', fontStyle: 'italic' }}>
                "{ed.justificacion}"
              </p>
              <div>
                {ed.itemsEliminados.map((ei, idx) => {
                  const diferencia = (ei.cantidadAntes - ei.cantidadDespues) * ei.precioUnitario
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#374151' }}>
                        {ei.itemNombre}: {ei.cantidadAntes} → {ei.cantidadDespues}
                      </span>
                      {ei.esAnulacion && (
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, color: '#DC2626' }}>
                          anulado
                        </span>
                      )}
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#DC2626', marginLeft: 'auto' }}>
                        −${diferencia.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── SesionDetalleModal ──────────────────────────────────────────────────── */
function SesionDetalleModal({
  sesion,
  canEdit,
  onClose,
  onEdit,
}: {
  sesion: SesionHistorial
  canEdit: boolean
  onClose: () => void
  onEdit: (p: PedidoParaEditar) => void
}) {
  const duracion = calcDuracion(sesion.iniciadaEn, sesion.cerradaEn)

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         200,
        background:     'rgba(45,53,97,0.55)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background:    'white',
          borderRadius:  16,
          width:         '100%',
          maxWidth:      600,
          maxHeight:     '85vh',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          boxShadow:     '0 24px 60px rgba(31,35,51,0.30)',
        }}
      >
        {/* Fixed header */}
        <div
          style={{
            padding:        '20px 24px',
            borderBottom:   '1px solid #e5e7eb',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            flexShrink:     0,
          }}
        >
          <div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 18, color: '#2D3561' }}>
              Mesa {sesion.mesaNumero}
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {fmtTime(sesion.iniciadaEn)} → {fmtTime(sesion.cerradaEn)} · {duracion} · ${sesion.totalSesion.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex', flexShrink: 0 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            overflowY:     'auto',
            padding:       '20px 24px',
            display:       'flex',
            flexDirection: 'column',
            gap:           16,
          }}
        >
          {sesion.pedidos.length === 0 ? (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '16px 0' }}>
              Sin pedidos registrados.
            </p>
          ) : (
            sesion.pedidos.map((p) => (
              <PedidoEnSesion
                key={p.id}
                pedido={p}
                canEdit={canEdit}
                onEdit={onEdit}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ── SesionCard ──────────────────────────────────────────────────────────── */
function SesionCard({
  sesion,
  onClick,
}: {
  sesion: SesionHistorial
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  const duracion     = calcDuracion(sesion.iniciadaEn, sesion.cerradaEn)
  const mostrarFecha = !isToday(sesion.cerradaEn)
  const tieneAnulados = sesion.pedidos.some((p) => p.estado === 'anulado')
  const tieneEditados = sesion.pedidos.some((p) => p.tieneEdiciones)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false) }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        background: 'white',
        border:     `1px solid ${hovered ? '#F6C4B8' : '#e5e7eb'}`,
        borderRadius: 12,
        padding:    16,
        cursor:     'pointer',
        display:    'flex',
        alignItems: 'center',
        gap:        14,
        boxShadow:  hovered ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
        transform:  pressed ? 'translateY(1px)' : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.08s',
      }}
    >
      {/* Table chip */}
      <div
        style={{
          width:          50,
          height:         50,
          borderRadius:   12,
          background:     '#EEF0F8',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          gap:            1,
        }}
      >
        <span
          style={{
            fontFamily:    'Inter, sans-serif',
            fontSize:      8,
            fontWeight:    600,
            color:         '#2D3561',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            lineHeight:    1,
          }}
        >
          MESA
        </span>
        <span
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize:   21,
            color:      '#2D3561',
            lineHeight: 1,
          }}
        >
          {sesion.mesaNumero}
        </span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Metrics row with dot separators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280' }}>
            <Clock size={13} color="#9ca3af" />
            {duracion}
          </span>
          <span style={{ color: '#d1d5db', fontSize: 12 }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280' }}>
            <ClipboardList size={13} color="#9ca3af" />
            {sesion.cantidadPedidos} {sesion.cantidadPedidos === 1 ? 'pedido' : 'pedidos'}
          </span>
          <span style={{ color: '#d1d5db', fontSize: 12 }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7280' }}>
            <DollarSign size={13} color="#9ca3af" />
            ${sesion.totalSesion.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Badges */}
        {(tieneAnulados || tieneEditados) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {tieneAnulados && (
              <span
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         5,
                  background:  '#fef2f2',
                  color:       '#dc2626',
                  fontFamily:  'Inter, sans-serif',
                  fontSize:    11,
                  fontWeight:  700,
                  padding:     '2px 8px',
                  borderRadius: 999,
                }}
              >
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
                con anulaciones
              </span>
            )}
            {tieneEditados && (
              <span
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         5,
                  background:  '#FDE5DF',
                  color:       '#E8563A',
                  fontFamily:  'Inter, sans-serif',
                  fontSize:    11,
                  fontWeight:  700,
                  padding:     '2px 8px',
                  borderRadius: 999,
                }}
              >
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#E8563A', flexShrink: 0 }} />
                con ediciones
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: date + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          {mostrarFecha && (
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#9ca3af' }}>
              {fmtDate(sesion.cerradaEn)}
            </div>
          )}
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#9ca3af' }}>
            {fmtTime(sesion.cerradaEn)}
          </div>
        </div>
        <ChevronRight size={16} color={hovered ? '#F6C4B8' : '#d1d5db'} />
      </div>
    </div>
  )
}

/* ── main page ───────────────────────────────────────────────────────────── */
export function HistorialSesionesPage() {
  const { user }                  = useAuth()
  const { selectedRestauranteId } = useContextStore()

  const [sesiones, setSesiones]                     = useState<SesionHistorial[]>([])
  const [loading, setLoading]                       = useState(false)
  const [period, setPeriod]                         = useState<Period>('hoy')
  const [search, setSearch]                         = useState('')
  const [searchFocused, setSearchFocused]           = useState(false)
  const [sesionSeleccionada, setSesionSeleccionada] = useState<SesionHistorial | null>(null)
  const [editingPedido, setEditingPedido]           = useState<PedidoParaEditar | null>(null)

  const canEdit = user?.rol === 'GERENTE' || user?.rol === 'ROOT'

  const { desde, hasta } = useMemo(() => getPeriodBounds(period), [period])

  const load = useCallback(async () => {
    if (!selectedRestauranteId) return
    setLoading(true)
    try {
      const data = await api.sessions.historial(selectedRestauranteId, desde, hasta)
      setSesiones(data)
    } catch {
      setSesiones([])
    } finally {
      setLoading(false)
    }
  }, [selectedRestauranteId, desde, hasta])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return sesiones
    const q = search.trim().toLowerCase()
    return sesiones.filter((s) => s.mesaNumero.toLowerCase().includes(q))
  }, [sesiones, search])

  function handleEditDone() {
    setEditingPedido(null)
    setSesionSeleccionada(null)
    void load()
  }

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        height:        'calc(100vh - 56px)',
        padding:       24,
        gap:           16,
        boxSizing:     'border-box',
        background:    '#F6F7F9',
      }}
    >
      {/* Topbar */}
      <h1
        style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   22,
          color:      '#2D3561',
          margin:     0,
          flexShrink: 0,
        }}
      >
        Historial de sesiones
      </h1>

      {/* Toolbar: segmented pills + search */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          flexShrink:     0,
          gap:            12,
        }}
      >
        {/* Segmented control */}
        <div
          style={{
            display:      'flex',
            gap:          2,
            background:   '#EEF0F8',
            borderRadius: 999,
            padding:      4,
          }}
        >
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding:      '6px 16px',
                borderRadius: 999,
                border:       'none',
                background:   period === p ? '#E8563A' : 'transparent',
                color:        period === p ? 'white' : '#6B7280',
                fontFamily:   'Montserrat, sans-serif',
                fontWeight:   700,
                fontSize:     13,
                cursor:       'pointer',
                boxShadow:    period === p ? '0 1px 4px rgba(232,86,58,0.35)' : 'none',
                transition:   'all 0.15s',
                whiteSpace:   'nowrap',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            background:   'white',
            border:       `1px solid ${searchFocused ? '#E8563A' : '#D1D5DB'}`,
            borderRadius: 10,
            padding:      '9px 14px',
            width:        280,
            boxSizing:    'border-box',
            transition:   'border-color 0.15s',
            flexShrink:   0,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Buscar por mesa..."
            style={{
              flex:       1,
              border:     'none',
              outline:    'none',
              fontFamily: 'Inter, sans-serif',
              fontSize:   13,
              color:      '#374151',
              background: 'transparent',
              minWidth:   0,
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9CA3AF', display: 'flex', flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div
        style={{
          flexShrink:          0,
          display:             'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap:                 14,
        }}
      >
        {/* 1 — Sesiones cerradas */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: '#E5E7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ClipboardList size={20} color="#2D3561" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>
              Sesiones cerradas
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 28, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {sesiones.length}
            </div>
          </div>
        </div>

        {/* 2 — Con ediciones */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: '#FDE5DF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Edit size={20} color="#E8563A" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>
              Con ediciones
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 28, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {sesiones.filter((s) => s.pedidos.some((p) => p.tieneEdiciones)).length}
            </div>
          </div>
        </div>

        {/* 3 — Pedidos anulados */}
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <XCircle size={20} color="#dc2626" />
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', fontWeight: 600 }}>
              Pedidos anulados
            </div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 28, color: '#2D3561', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {sesiones.reduce((acc, s) => acc + s.pedidos.filter((p) => p.estado === 'anulado').length, 0)}
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div
        style={{
          flex:          1,
          minHeight:     0,
          overflowY:     'auto',
          display:       'flex',
          flexDirection: 'column',
          gap:           10,
        }}
      >
        {loading ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingTop: 32 }}>
            Cargando sesiones…
          </p>
        ) : filtered.length === 0 ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingTop: 32 }}>
            No hay sesiones cerradas en este período.
          </p>
        ) : (
          filtered.map((s) => (
            <SesionCard
              key={s.sesionId}
              sesion={s}
              onClick={() => setSesionSeleccionada(s)}
            />
          ))
        )}
      </div>

      {/* Session detail modal — z-index 200 */}
      {sesionSeleccionada && !editingPedido && (
        <SesionDetalleModal
          sesion={sesionSeleccionada}
          canEdit={canEdit}
          onClose={() => setSesionSeleccionada(null)}
          onEdit={setEditingPedido}
        />
      )}

      {/* Edit modal — z-index 1000, sibling of detail modal */}
      {editingPedido && (
        <EditModal
          pedido={editingPedido}
          onClose={() => setEditingPedido(null)}
          onDone={handleEditDone}
        />
      )}
    </div>
  )
}
