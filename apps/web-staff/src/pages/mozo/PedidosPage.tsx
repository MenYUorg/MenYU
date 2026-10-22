import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { AlertTriangle, ChevronRight, ClipboardList, Clock, RefreshCw } from 'lucide-react'
import { usePerfil } from '@menyu/auth-client'
import { APARIENCIA_PEDIDOS, EditarPedidoModal, type AparienciaEditarPedido, type ItemEditable } from '@menyu/ui/editar-pedido'
import { urlDelSocket } from '@menyu/ui/socket'
import { api } from '../../services/api'
import type { PedidoRico } from '../../services/api'
import { puedeEditarPedidos, useNombreDelRol, useRestauranteId, useRolesActuales } from '../../store/contextoStore'
import { PageHeader } from '../../components/PageHeader'
import { conectarImpresora, impresoraConectada, imprimirPedido, testPrint } from '../../services/impresora'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// ── Palette & WS ──────────────────────────────────────────────────────────────
const C = {
  navy:      '#2D3561',
  orange:    '#E8563A',
  green:     '#16a34a',
  greenBg:   '#dcfce7',
  amber:     '#d97706',
  amberBg:   '#fef3c7',
  blue:      '#2563eb',
  blueBg:    '#dbeafe',
  border:    '#e5e7eb',
  bgLight:   '#f9fafb',
  textMuted: '#6b7280',
  white:     '#ffffff',
  red:       '#dc2626',
  redBg:     '#fee2e2',
} as const

const WS_URL: string =
  urlDelSocket(import.meta.env.VITE_WS_URL as string | undefined, import.meta.env.VITE_API_URL as string | undefined) ??
  ''

type EstadoPedido = 'pendiente' | 'en_preparacion' | 'listo'

const ESTADOS: EstadoPedido[] = ['pendiente', 'en_preparacion', 'listo']

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  pendiente:      'Pendiente',
  en_preparacion: 'En preparación',
  listo:          'Listo',
}

const ESTADO_NEXT: Record<EstadoPedido, EstadoPedido | null> = {
  pendiente:      'en_preparacion',
  en_preparacion: 'listo',
  listo:          null,
}

const ESTADO_COLORS: Record<EstadoPedido, { bg: string; text: string; border: string }> = {
  pendiente:      { bg: C.amberBg, text: C.amber, border: '#fde68a' },
  en_preparacion: { bg: C.blueBg,  text: C.blue,  border: '#bfdbfe' },
  listo:          { bg: C.greenBg, text: C.green, border: '#bbf7d0' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function minDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

function cantActual(item: PedidoRico['items'][number]): number {
  return item.cantidadEditada ?? item.cantidad
}

function itemsEditables(pedido: PedidoRico): ItemEditable[] {
  return pedido.items.map((i) => ({ id: i.id, nombre: i.item.nombre, cantidadActual: cantActual(i), precioUnitario: Number(i.precioUnitario) }))
}

// El diseño de pedidos, sin las transiciones que el modal del mozo nunca tuvo.
const APARIENCIA_MOZO: AparienciaEditarPedido = { ...APARIENCIA_PEDIDOS, transicionFila: undefined, transicionGuardar: undefined }

function shortId(id: string): string {
  return '#' + id.slice(0, 8).toUpperCase()
}

// ── PedidoCard ────────────────────────────────────────────────────────────────
function PedidoCard({
  pedido, onAvanzar, onEntregar, onEditar, loading, puedeEditar,
}: {
  pedido: PedidoRico; onAvanzar: (id: string, estado: EstadoPedido) => void
  onEntregar: (id: string) => void; onEditar: (p: PedidoRico) => void; loading: boolean
  puedeEditar: boolean
}) {
  const estado    = pedido.estado as EstadoPedido
  const siguiente = ESTADO_NEXT[estado]
  const colores   = ESTADO_COLORS[estado] ?? ESTADO_COLORS.pendiente
  const minutos   = minDesde(pedido.createdAt)
  const urgente   = minutos >= 20
  const hasEdits  = pedido.items.some((i) => i.cantidadEditada !== null)
  const isAnulado = pedido.estado === 'anulado'
  const badgeLabel  = isAnulado ? 'Anulado' : hasEdits ? `${ESTADO_LABEL[estado] ?? estado} · Editado` : ESTADO_LABEL[estado] ?? estado
  const badgeBg     = isAnulado ? '#fef2f2' : hasEdits ? '#FDE5DF' : colores.bg
  const badgeColor  = isAnulado ? '#dc2626' : hasEdits ? '#E8563A' : colores.text
  const badgeBorder = isAnulado ? '#fecaca' : hasEdits ? '#fca5a5' : colores.border
  // Editar un pedido es de GERENTE, JEFE_SALON y MOZO: al OWNER el backend le responde 403 (matriz de la 4.3).
  const canEdit     = puedeEditar && (estado === 'pendiente' || estado === 'en_preparacion')

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', background: C.white, border: `1px solid ${urgente && estado === 'pendiente' ? '#fca5a5' : C.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: C.navy }}>Mesa {pedido.mesa.numero}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Clock size={12} color={urgente ? C.red : C.textMuted} />
            <span style={{ fontSize: 12, color: urgente ? C.red : C.textMuted, fontWeight: urgente ? 600 : 400 }}>
              {formatHora(pedido.createdAt)} · {minutos}min
            </span>
            {urgente && <AlertTriangle size={12} color={C.red} />}
          </div>
        </div>
        <span style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {badgeLabel}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pedido.items.map((item) => {
          const cantOrig   = item.cantidad
          const cantEdit   = item.cantidadEditada ?? cantOrig
          const cantQuitada = cantOrig - cantEdit
          return (
            <div key={item.id} style={{ fontSize: 13 }}>
              {cantEdit === 0 ? (
                <span style={{ fontWeight: 600, color: C.red, textDecoration: 'line-through' }}>{cantOrig}× {item.item.nombre}</span>
              ) : cantQuitada > 0 ? (
                <>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{cantEdit}× {item.item.nombre}</span>
                  <div><span style={{ fontSize: 12, color: C.red, textDecoration: 'line-through' }}>{cantQuitada}× {item.item.nombre}</span></div>
                </>
              ) : (
                <span style={{ fontWeight: 600, color: '#374151' }}>{cantOrig}× {item.item.nombre}</span>
              )}
              {cantEdit > 0 && item.mods.length > 0 && (
                <div style={{ paddingLeft: 12, marginTop: 2 }}>
                  {item.mods.map((mod, i) => (
                    <div key={i} style={{ fontSize: 11, color: mod.accion.toLowerCase() === 'quitar' ? C.red : '#16a34a', marginTop: 2 }}>
                      {mod.accion.toLowerCase() === 'quitar' ? `sin ${mod.itemIngrediente?.ingrediente?.nombre ?? ''}` : `+${mod.cantidad ?? 1} ${mod.itemIngrediente?.ingrediente?.nombre ?? ''}`}
                    </div>
                  ))}
                </div>
              )}
              {cantEdit > 0 && item.notas && item.notas.trim() !== '' && (
                <div style={{ fontSize: 11, color: '#854d0e', background: '#fef9c3', border: '1px solid #fef08a', borderRadius: 6, padding: '3px 8px', marginTop: 4, fontStyle: 'italic' }}>
                  📝 {item.notas}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {siguiente ? (
        <button
          onClick={() => onAvanzar(pedido.id, siguiente)}
          disabled={loading}
          style={{ marginTop: 4, background: loading ? '#d1d5db' : C.navy, color: C.white, border: 'none', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'Montserrat,sans-serif' }}
        >
          {loading ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ChevronRight size={12} />}
          {ESTADO_LABEL[siguiente]}
        </button>
      ) : estado === 'listo' ? (
        <button
          onClick={() => onEntregar(pedido.id)}
          disabled={loading}
          style={{ marginTop: 4, background: loading ? '#d1d5db' : C.green, color: C.white, border: 'none', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'Montserrat,sans-serif' }}
        >
          {loading && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
          ✓ Entregar
        </button>
      ) : null}

      {canEdit && (
        <button
          onClick={() => onEditar(pedido)}
          style={{ background: 'none', border: 'none', padding: '2px 0', fontSize: 11, color: '#9CA3AF', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textAlign: 'center', width: '100%' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.textMuted }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF' }}
        >
          Editar pedido
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function PedidosPage() {
  const navigate = useNavigate()
  const perfil = usePerfil()
  const restauranteId = useRestauranteId()
  const nombreMozo = perfil.nombre || perfil.email
  const rolMostrado = useNombreDelRol()
  const puedeEditar = puedeEditarPedidos(useRolesActuales())
  const [pedidos,       setPedidos]       = useState<PedidoRico[]>([])
  const [loadingIds,    setLoadingIds]    = useState<Set<string>>(new Set())
  const [error,         setError]         = useState<string | null>(null)
  const [editingPedido, setEditingPedido] = useState<PedidoRico | null>(null)
  const [conectada,     setConectada]     = useState<boolean>(impresoraConectada())
  const socketRef = useRef<Socket | null>(null)

  const handleConectarImpresora = useCallback(async () => {
    try {
      await conectarImpresora()
      setConectada(true)
    } catch {
      console.error('No se pudo conectar la impresora.')
    }
  }, [])

  const fetchAll = useCallback(async () => {
    if (!restauranteId) return
    setError(null)
    try {
      const [pendientes, enPrep, listos] = await Promise.all([
        api.pedidos.getByRestaurante(restauranteId, { estado: 'pendiente' }),
        api.pedidos.getByRestaurante(restauranteId, { estado: 'en_preparacion' }),
        api.pedidos.getByRestaurante(restauranteId, { estado: 'listo' }),
      ])
      setPedidos([...pendientes, ...enPrep, ...listos])
    } catch {
      setError('No se pudieron cargar los pedidos.')
    }
  }, [restauranteId])

  useEffect(() => { void fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!restauranteId) return
    // El gateway no autentica la conexión (docs/auth/specs/auth.md, Fuera de alcance): no se le manda ningún token.
    const socket: Socket = io(`${WS_URL}/ws`, { transports: ['websocket'] })
    socketRef.current = socket
    socket.on('connect', () => { socket.emit('cocina:join', { restauranteId }) })
    socket.on('order:new', (pedido: PedidoRico) => {
      imprimirPedido(pedido).catch(console.error)
      setPedidos((prev) => prev.some((p) => p.id === pedido.id) ? prev : [pedido, ...prev])
    })
    socket.on('order:updated', (pedido: PedidoRico) => {
      setPedidos((prev) => {
        const estado = pedido.estado as string
        if (!ESTADOS.includes(estado as EstadoPedido)) return prev.filter((p) => p.id !== pedido.id)
        const idx = prev.findIndex((p) => p.id === pedido.id)
        if (idx === -1) return [pedido, ...prev]
        const next = [...prev]; next[idx] = pedido; return next
      })
    })
    return () => { socket.disconnect(); socketRef.current = null }
  }, [restauranteId])

  const handleAvanzar = useCallback(async (id: string, nuevoEstado: EstadoPedido) => {
    setLoadingIds((prev) => new Set(prev).add(id))
    const prev = pedidos.find((p) => p.id === id)
    setPedidos((all) => all.map((p) => p.id === id ? { ...p, estado: nuevoEstado } : p))
    try {
      const updated = await api.pedidos.cambiarEstado(id, nuevoEstado)
      const estado  = updated.estado as string
      if (!ESTADOS.includes(estado as EstadoPedido)) {
        setPedidos((all) => all.filter((p) => p.id !== id))
      } else {
        setPedidos((all) => all.map((p) => p.id === id ? updated : p))
      }
    } catch {
      if (prev) setPedidos((all) => all.map((p) => p.id === id ? prev : p))
    } finally {
      setLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }, [pedidos])

  const handleEntregar = useCallback(async (id: string) => {
    setLoadingIds((prev) => new Set(prev).add(id))
    const prevPedido = pedidos.find((p) => p.id === id)
    setPedidos((all) => all.filter((p) => p.id !== id))
    try {
      await api.pedidos.cambiarEstado(id, 'entregado')
    } catch {
      if (prevPedido) setPedidos((all) => [...all, prevPedido])
    } finally {
      setLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }, [pedidos])

  const handleEditDone = useCallback((updated: PedidoRico) => {
    setEditingPedido(null)
    if (updated.estado === 'anulado' || !ESTADOS.includes(updated.estado as EstadoPedido)) {
      setPedidos((prev) => prev.filter((p) => p.id !== updated.id))
    } else {
      setPedidos((prev) => prev.map((p) => p.id === updated.id ? updated : p))
    }
  }, [])

  const byEstado = (estado: EstadoPedido) =>
    pedidos
      .filter((p) => p.estado === estado)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <PageHeader
        title="Pedidos"
        icon={<ClipboardList size={18} />}
        onBack={() => navigate('/mozo')}
        onRefresh={() => void fetchAll()}
        userName={nombreMozo}
        userRole={rolMostrado}
        userInitials={getInitials(nombreMozo)}
        extraActions={
          conectada ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#86efac', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, background: '#4ade80', borderRadius: '50%', display: 'inline-block' }} />
                Impresora
              </span>
              <button
                onClick={() => void testPrint().catch(console.error)}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'Montserrat,sans-serif' }}
              >
                Test
              </button>
            </div>
          ) : (
            <button
              onClick={() => void handleConectarImpresora()}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'Montserrat,sans-serif', flexShrink: 0 }}
            >
              Conectar impresora
            </button>
          )
        }
      />

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 20px', fontSize: 13 }}>{error}</div>
      )}

      {/* Kanban */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 16, overflow: 'hidden' }}>
        {ESTADOS.map((estado) => {
          const items   = byEstado(estado)
          const colores = ESTADO_COLORS[estado]
          return (
            <div key={estado} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bgLight, borderRadius: 12, border: `1px solid ${C.border}` }}>
              <div style={{ flexShrink: 0, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.white }}>
                <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy }}>{ESTADO_LABEL[estado]}</span>
                <span style={{ background: colores.bg, color: colores.text, borderRadius: 20, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                  {items.length}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textMuted, fontSize: 13 }}>Sin pedidos</div>
                ) : (
                  items.map((p) => (
                    <PedidoCard
                      key={p.id} pedido={p}
                      onAvanzar={handleAvanzar} onEntregar={handleEntregar}
                      onEditar={setEditingPedido} loading={loadingIds.has(p.id)}
                      puedeEditar={puedeEditar}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editingPedido && (
        <EditarPedidoModal
          codigo={shortId(editingPedido.id)}
          items={itemsEditables(editingPedido)}
          pagado={editingPedido.pagado === true}
          apariencia={APARIENCIA_MOZO}
          onGuardar={async (edicion) => handleEditDone(await api.pedidos.editarItem(editingPedido.id, edicion))}
          onClose={() => setEditingPedido(null)}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
