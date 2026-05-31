import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@menyu/auth'
import { AlertTriangle, ChefHat, ChevronRight, Clock, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'
import type { PedidoRico } from '../../services/api'
import { useMozoStore } from '../../store/mozoStore'
import * as socketService from '../../services/socket'
import type { Pedido } from '@menyu/types'

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

type EstadoPedido = 'en_preparacion' | 'listo'

const ESTADOS: EstadoPedido[] = ['en_preparacion', 'listo']

const ESTADOS_COCINA: EstadoPedido[] = ['en_preparacion', 'listo']

const ESTADO_LABEL: Record<string, string> = {
  en_preparacion: 'En preparación',
  listo:          'Listo',
}

const ESTADO_NEXT: Record<string, EstadoPedido | null> = {
  en_preparacion: 'listo',
  listo:          null,
}

const BOTON_LABEL: Record<string, string> = {
  en_preparacion: 'Listo',
}

const ESTADO_COLORS: Record<string, { bg: string; text: string; border: string }> = {
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

// ── PedidoCard ────────────────────────────────────────────────────────────────
function PedidoCard({
  pedido, onAvanzar, loading,
}: {
  pedido:    PedidoRico
  onAvanzar: (id: string, estado: EstadoPedido) => void
  loading:   boolean
}) {
  const estado    = pedido.estado as string
  const siguiente = ESTADO_NEXT[estado] ?? null
  const colores   = ESTADO_COLORS[estado] ?? ESTADO_COLORS.en_preparacion
  const minutos   = minDesde(pedido.createdAt)
  const urgente   = minutos >= 20
  const hasEdits  = pedido.items.some((i) => i.cantidadEditada !== null)
  const isAnulado = pedido.estado === 'anulado'

  const badgeLabel  = isAnulado ? 'Anulado'
                    : hasEdits  ? `${ESTADO_LABEL[estado] ?? estado} · Editado`
                    :              ESTADO_LABEL[estado] ?? estado
  const badgeBg     = isAnulado ? '#fef2f2' : hasEdits ? '#FDE5DF' : colores.bg
  const badgeColor  = isAnulado ? '#dc2626' : hasEdits ? '#E8563A' : colores.text
  const badgeBorder = isAnulado ? '#fecaca' : hasEdits ? '#fca5a5' : colores.border

  return (
    <div style={{
      width: '100%', boxSizing: 'border-box', background: C.white,
      border: `1px solid ${C.border}`,
      ...(isAnulado ? { borderLeft: '4px solid #dc2626' } : {}),
      borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 16, color: C.navy }}>
            Mesa {pedido.mesa.numero}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Clock size={12} color={urgente ? C.red : C.textMuted} />
            <span style={{ fontSize: 12, color: urgente ? C.red : C.textMuted, fontWeight: urgente ? 600 : 400 }}>
              {formatHora(pedido.createdAt)} · {minutos}min
            </span>
            {urgente && <AlertTriangle size={12} color={C.red} />}
          </div>
        </div>
        <span style={{
          background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}`,
          borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {badgeLabel}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {pedido.items.map((item) => {
          const cantOrig    = item.cantidad
          const cantEdit    = cantActual(item)
          const cantQuitada = cantOrig - cantEdit
          return (
            <div key={item.id} style={{ fontSize: 13 }}>
              {isAnulado || cantEdit === 0 ? (
                <span style={{ fontWeight: 600, color: C.red, textDecoration: 'line-through' }}>
                  {cantOrig}× {item.item.nombre}
                </span>
              ) : cantQuitada > 0 ? (
                <>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{cantEdit}× {item.item.nombre}</span>
                  <div>
                    <span style={{ fontSize: 12, color: C.red, textDecoration: 'line-through' }}>
                      {cantQuitada}× {item.item.nombre}
                    </span>
                  </div>
                </>
              ) : (
                <span style={{ fontWeight: 600, color: '#374151' }}>{cantOrig}× {item.item.nombre}</span>
              )}
              {!isAnulado && cantEdit > 0 && item.mods.length > 0 && (
                <div style={{ paddingLeft: 12, marginTop: 2 }}>
                  {item.mods.map((mod, i) => (
                    <div key={i} style={{ fontSize: 11, color: mod.accion.toLowerCase() === 'quitar' ? C.red : '#16a34a', marginTop: 2 }}>
                      {mod.accion.toLowerCase() === 'quitar'
                        ? `sin ${mod.itemIngrediente?.ingrediente?.nombre ?? ''}`
                        : `+${mod.cantidad ?? 1} ${mod.itemIngrediente?.ingrediente?.nombre ?? ''}`}
                    </div>
                  ))}
                </div>
              )}
              {!isAnulado && cantEdit > 0 && item.notas && item.notas.trim() !== '' && (
                <div style={{ fontSize: 11, color: '#854d0e', background: '#fef9c3', border: '1px solid #fef08a', borderRadius: 6, padding: '3px 8px', marginTop: 4, fontStyle: 'italic' }}>
                  📝 {item.notas}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!isAnulado && siguiente && BOTON_LABEL[estado] && (
        <button
          onClick={() => onAvanzar(pedido.id, siguiente)}
          disabled={loading}
          style={{
            marginTop: 4, background: loading ? '#d1d5db' : C.navy, color: C.white,
            border: 'none', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6, fontFamily: 'Montserrat,sans-serif',
          }}
        >
          {loading
            ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
            : <ChevronRight size={12} />}
          {BOTON_LABEL[estado]}
        </button>
      )}
    </div>
  )
}

// ── CocinaPage ────────────────────────────────────────────────────────────────
export function CocinaPage() {
  const { user } = useAuth()
  const restauranteIdStore = useMozoStore((s) => s.restauranteId)
  const restauranteId = user?.restauranteId ?? restauranteIdStore

  const [pedidos,    setPedidos]    = useState<PedidoRico[]>([])
  const [anulados,   setAnulados]   = useState<Map<string, PedidoRico>>(new Map())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [error,      setError]      = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const anuladosTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const fetchAll = useCallback(async () => {
    if (!restauranteId) return
    setError(null)
    setRefreshing(true)
    try {
      const [enPrep, listos] = await Promise.all([
        api.pedidos.getByRestaurante(restauranteId, { estado: 'en_preparacion' }),
        api.pedidos.getByRestaurante(restauranteId, { estado: 'listo' }),
      ])
      setPedidos([...enPrep, ...listos])
    } catch {
      setError('No se pudieron cargar los pedidos.')
    } finally {
      setRefreshing(false)
    }
  }, [restauranteId])

  useEffect(() => { void fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!restauranteId) return

    socketService.joinRestauranteComoCocina(restauranteId)

    const unsubNuevo = socketService.onPedidoNuevo((pedido: Pedido) => {
      const rico = pedido as unknown as PedidoRico
      if (!ESTADOS_COCINA.includes(rico.estado as EstadoPedido)) return
      setPedidos((prev) => prev.some((p) => p.id === rico.id) ? prev : [rico, ...prev])
    })

    const unsubActualizado = socketService.onPedidoActualizado((pedido: Pedido) => {
      const rico = pedido as unknown as PedidoRico
      if (rico.estado === 'anulado') {
        setPedidos((prev) => prev.filter((p) => p.id !== rico.id))
        setAnulados((prev) => new Map(prev).set(rico.id, rico))
        const existing = anuladosTimers.current.get(rico.id)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          setAnulados((prev) => { const next = new Map(prev); next.delete(rico.id); return next })
          anuladosTimers.current.delete(rico.id)
        }, 180000)
        anuladosTimers.current.set(rico.id, timer)
        return
      }
      setPedidos((prev) => {
        const estado = rico.estado as string
        if (!ESTADOS_COCINA.includes(estado as EstadoPedido)) return prev.filter((p) => p.id !== rico.id)
        const idx = prev.findIndex((p) => p.id === rico.id)
        if (idx === -1) return [rico, ...prev]
        const next = [...prev]; next[idx] = rico; return next
      })
    })

    const timers = anuladosTimers.current
    return () => {
      unsubNuevo()
      unsubActualizado()
      timers.forEach((t) => clearTimeout(t))
    }
  }, [restauranteId])

  const handleAvanzar = useCallback(async (id: string, nuevoEstado: EstadoPedido) => {
    setLoadingIds((prev) => new Set(prev).add(id))
    const prev = pedidos.find((p) => p.id === id)
    setPedidos((all) => all.map((p) => p.id === id ? { ...p, estado: nuevoEstado } : p))
    try {
      const updated = await api.pedidos.cambiarEstado(id, nuevoEstado)
      const estado  = updated.estado as string
      if (!ESTADOS_COCINA.includes(estado as EstadoPedido)) {
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

  const byEstado = (estado: EstadoPedido) => {
    const activos = pedidos
      .filter((p) => p.estado === estado)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (estado !== 'en_preparacion') return activos
    const anuladosList = Array.from(anulados.values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return [...activos, ...anuladosList]
  }

  const totalActivos = pedidos.filter((p) => p.estado === 'en_preparacion').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header style={{ background: C.navy, height: 56, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flexShrink: 0 }}>
        <ChefHat size={20} color="white" />
        <span style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 18, color: 'white' }}>Cocina</span>
        {totalActivos > 0 && (
          <span style={{
            background: C.orange, color: 'white', fontFamily: 'Montserrat,sans-serif',
            fontWeight: 700, fontSize: 12, padding: '2px 10px', borderRadius: 999,
          }}>
            {totalActivos}
          </span>
        )}
        <button
          onClick={() => void fetchAll()}
          disabled={refreshing}
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: refreshing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'white', opacity: refreshing ? 0.7 : 1 }}
        >
          <RefreshCw size={12} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
          {refreshing ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 20px', fontSize: 13 }}>{error}</div>
      )}

      {/* Kanban — 2 columnas */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: 16, overflow: 'hidden' }}>
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
                      key={p.id}
                      pedido={p}
                      onAvanzar={handleAvanzar}
                      loading={loadingIds.has(p.id)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
