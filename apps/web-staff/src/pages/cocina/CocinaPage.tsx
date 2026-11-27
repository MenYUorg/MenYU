import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, ChefHat, ChevronRight, Clock, LogOut, Printer, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'
import type { PedidoRico } from '../../services/api'
import { useContextoStore, useRestauranteId } from '../../store/contextoStore'
import * as socketService from '../../services/socket'
import { cerrarSesion } from '../../services/socket'
import type { Pedido } from '@menyu/types'
import { useComandas } from '../../hooks/useComandas'
import { comandaRecordada, recordarComanda } from '../../utils/comandaRecordada'
import {
  columnaDelPedido, idsActivos, itemsPropios, ocultosVigentes, partirItems, pedidoParaImprimir, pestaniaVigente,
  puedeMarcarListo, tieneAlgoVisible,
} from '../../utils/comandasDeCocina'
import type { ColumnaDeCocina, Pestania } from '../../utils/comandasDeCocina'
import { imprimirPedido, conectarImpresora, impresoraConectada, testPrint } from '../../services/impresora'
import { marcarEntrada, sembrarEntradas } from '../../utils/entradasACocina'

// ── Palette & WS ──────────────────────────────────────────────────────────────
const C = {
  navy:      '#2D3561',
  orange:    '#E8563A',
  green:     '#16a34a',
  greenBg:   '#dcfce7',
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

// ── Audio ─────────────────────────────────────────────────────────────────────
function playSound(type: 'nuevo' | 'editado' | 'anulado') {
  try {
    const ctx = new AudioContext()
    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const g   = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0.28, ctx.currentTime + start)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    if (type === 'nuevo') {
      tone(523, 0,    0.15)   // C5 — ding
      tone(659, 0.18, 0.22)   // E5 — dong
    } else if (type === 'editado') {
      tone(440, 0,    0.10)   // A4
      tone(440, 0.18, 0.10)   // A4 — doble beep
    } else {
      tone(659, 0,    0.12)   // E5
      tone(523, 0.16, 0.12)   // C5 — descending
      tone(392, 0.32, 0.22)   // G4
    }
    setTimeout(() => void ctx.close(), 1200)
  } catch { /* navegador sin AudioContext */ }
}

// ── PedidoCard ────────────────────────────────────────────────────────────────
const TEXTO_SIN_IMPRESORA = 'Conectá la impresora para reimprimir'
const TEXTO_ERROR_IMPRESION = 'No se pudo imprimir. Revisá la impresora.'
const SOLO_PARA_LECTORES = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const

function PedidoCard({
  pedido, columna, conBoton, onListo, loading, pestania, activas, impresoraLista,
}: {
  pedido:    PedidoRico
  /** La columna en la que está la tarjeta en esta pestania (no siempre es la del estado del pedido). */
  columna:   ColumnaDeCocina
  /** Si la pestania tiene un "Listo" que tocar en este pedido. */
  conBoton:  boolean
  onListo:   (id: string, pestania: Pestania) => void
  loading:   boolean
  pestania:  Pestania
  activas:   string[]
  impresoraLista: boolean
}) {
  const { visibles, ocultos } = partirItems(pedido.items, pestania, activas)
  const ocultosN = ocultosVigentes(ocultos)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [errorDeImpresion, setErrorDeImpresion] = useState(false)
  const idSinImpresora = useId()
  const colores   = ESTADO_COLORS[columna]
  const minutos   = minDesde(pedido.createdAt)
  const urgente   = minutos >= 20
  const hasEdits  = visibles.some((i) => i.cantidadEditada !== null)
  const isAnulado = pedido.estado === 'anulado'
  // Las líneas ya marcadas "Listo" se señalan mientras el pedido sigue en preparación; en uno listo estarían todas.
  const marcasVisibles = pedido.estado === 'en_preparacion'
  // Reimprimir es una acción explícita: no pasa por el registro de entradas ni suena. Lo que sale es lo que se ve en la pestaña.
  // Solo en la columna "En preparación" de la pestania (un anulado también está ahí, pero no se reimprime).
  const paraReimprimir = columna === 'en_preparacion' && !isAnulado ? pedidoParaImprimir(pedido, pestania, activas) : null
  const reimprimir = async () => {
    if (!paraReimprimir || !impresoraLista || imprimiendo) return
    setErrorDeImpresion(false)
    setImprimiendo(true)
    try {
      await imprimirPedido(paraReimprimir)
    } catch {
      setErrorDeImpresion(true)
    } finally {
      setImprimiendo(false)
    }
  }

  const badgeLabel  = isAnulado ? 'Anulado'
                    : hasEdits  ? `${ESTADO_LABEL[columna]} · Editado`
                    :              ESTADO_LABEL[columna]
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span style={{
            background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}`,
            borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600,
            whiteSpace: 'nowrap',
          }}>
            {badgeLabel}
          </span>
          {paraReimprimir && (
            <>
              <button
                type="button"
                className="cocina-reimprimir"
                aria-label={`Reimprimir pedido de la mesa ${pedido.mesa.numero}`}
                aria-disabled={!impresoraLista || imprimiendo}
                aria-describedby={impresoraLista ? undefined : idSinImpresora}
                title={impresoraLista ? undefined : TEXTO_SIN_IMPRESORA}
                onClick={() => void reimprimir()}
                style={{
                  background: C.white, color: C.navy, border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '4px 8px', display: 'flex', alignItems: 'center', cursor: impresoraLista ? 'pointer' : 'not-allowed',
                  opacity: impresoraLista && !imprimiendo ? 1 : 0.5,
                }}
              >
                {imprimiendo
                  ? <RefreshCw size={14} aria-hidden="true" style={{ animation: 'spin 1s linear infinite' }} />
                  : <Printer size={14} aria-hidden="true" />}
              </button>
              {!impresoraLista && <span id={idSinImpresora} style={SOLO_PARA_LECTORES}>{TEXTO_SIN_IMPRESORA}</span>}
            </>
          )}
        </div>
      </div>

      {errorDeImpresion && (
        <div role="alert" style={{ fontSize: 12, color: C.red, background: C.redBg, borderRadius: 7, padding: '6px 10px', fontWeight: 600 }}>
          {TEXTO_ERROR_IMPRESION}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibles.map((item) => {
          const cantOrig    = item.cantidad
          const cantEdit    = cantActual(item)
          const cantQuitada = cantOrig - cantEdit
          const marca = marcasVisibles && item.listoEn !== null && (
            <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: C.green }}>
              <Check size={12} aria-hidden="true" />
              Listo
            </span>
          )
          return (
            <div key={item.id} style={{ fontSize: 13 }}>
              {isAnulado || cantEdit === 0 ? (
                <span style={{ fontWeight: 600, color: C.red, textDecoration: 'line-through' }}>
                  {cantOrig}× {item.item.nombre}
                </span>
              ) : cantQuitada > 0 ? (
                <>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{cantEdit}× {item.item.nombre}</span>
                  {marca}
                  <div>
                    <span style={{ fontSize: 12, color: C.red, textDecoration: 'line-through' }}>
                      {cantQuitada}× {item.item.nombre}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{cantOrig}× {item.item.nombre}</span>
                  {marca}
                </>
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
        {ocultosN > 0 && (
          <div style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>
            +{ocultosN} de otras comandas
          </div>
        )}
      </div>

      {!isAnulado && conBoton && (
        <button
          onClick={() => onListo(pedido.id, pestania)}
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
          Listo
        </button>
      )}
    </div>
  )
}

// ── CocinaPage ────────────────────────────────────────────────────────────────
export function CocinaPage() {
  const navigate = useNavigate()
  const restauranteId = useRestauranteId()
  const trabajaEnVarios = useContextoStore((s) => s.restaurantes.length > 1)

  const [pedidos,    setPedidos]    = useState<PedidoRico[]>([])
  const [anulados,   setAnulados]   = useState<Map<string, PedidoRico>>(new Map())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [error,      setError]      = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [eleccion,   setEleccion]   = useState<string | null>(() => (restauranteId ? comandaRecordada(restauranteId) : null))
  const [conectada,  setConectada]  = useState<boolean>(impresoraConectada())
  const anuladosTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Lo que el socket y las respuestas tardías leen sin volver a suscribirse; se sincronizan en efectos.
  const restauranteIdRef = useRef(restauranteId)
  const pestaniaRef = useRef<Pestania>(null)
  const activasRef = useRef<string[]>([])
  // Pedidos que ya entraron a cocina en esta pantalla: decide fuera de React la primera entrada (sonido e impresion).
  const yaEntraron = useRef<Set<string>>(new Set())

  const fetchAll = useCallback(async () => {
    if (!restauranteId) return
    setError(null)
    setRefreshing(true)
    try {
      const [enPrep, listos] = await Promise.all([
        api.pedidos.getByRestaurante(restauranteId, { estado: 'en_preparacion' }),
        api.pedidos.getByRestaurante(restauranteId, { estado: 'listo' }),
      ])
      if (restauranteIdRef.current !== restauranteId) return   // respuesta de un restaurante anterior
      sembrarEntradas(yaEntraron.current, [...enPrep, ...listos].map((p) => p.id))
      setPedidos([...enPrep, ...listos])
    } catch {
      if (restauranteIdRef.current === restauranteId) setError('No se pudieron cargar los pedidos.')
    } finally {
      setRefreshing(false)
    }
  }, [restauranteId])

  const handleConectar = useCallback(async () => {
    try {
      await conectarImpresora()
      setConectada(true)
    } catch {
      console.error('No se pudo conectar la impresora.')
    }
  }, [])

  useEffect(() => { restauranteIdRef.current = restauranteId }, [restauranteId])

  // Antes de los efectos de carga y de socket: al cambiar de restaurante arranca un registro vacio.
  useEffect(() => { yaEntraron.current.clear() }, [restauranteId])

  // Un pedido entra a cocina UNA vez por pantalla: suena e imprime (solo los items de la pestania de este dispositivo)
  // la primera vez (sin las líneas eliminadas; si no queda ninguna, no imprime). Solo usa refs: puede llamarse desde el
  // socket sin volver a suscribirse.
  const alEntrarACocina = useCallback((pedido: PedidoRico) => {
    if (!marcarEntrada(yaEntraron.current, pedido.id)) return
    if (!tieneAlgoVisible(pedido.items, pestaniaRef.current, activasRef.current)) return
    playSound('nuevo')
    if (pedido.estado !== 'en_preparacion') return
    const paraImprimir = pedidoParaImprimir(pedido, pestaniaRef.current, activasRef.current)
    if (paraImprimir) imprimirPedido(paraImprimir).catch(console.error)
  }, [])

  useEffect(() => { void fetchAll() }, [fetchAll])

  // Sin lista (o ante un fallo, la última buena) no hay pestañas: se ve todo.
  const { comandas, recargar: recargarComandas } = useComandas(restauranteId)

  useEffect(() => {
    setEleccion(restauranteId ? comandaRecordada(restauranteId) : null)
  }, [restauranteId])

  useEffect(() => {
    if (!restauranteId) return

    socketService.joinRestauranteComoCocina(restauranteId)

    const unsubNuevo = socketService.onPedidoNuevo((pedido: Pedido) => {
      const rico = pedido as unknown as PedidoRico
      if (!ESTADOS_COCINA.includes(rico.estado as EstadoPedido)) return
      alEntrarACocina(rico)
      setPedidos((prev) => prev.some((p) => p.id === rico.id) ? prev : [rico, ...prev])
    })

    const unsubActualizado = socketService.onPedidoActualizado((pedido: Pedido) => {
      const rico = pedido as unknown as PedidoRico
      if (!ESTADOS_COCINA.includes(rico.estado as EstadoPedido)) {
        setPedidos((prev) => prev.filter((p) => p.id !== rico.id))
        return
      }
      // mozo avanzó pendiente → en_preparacion (sin efectos dentro del updater: StrictMode lo corre dos veces)
      alEntrarACocina(rico)
      setPedidos((prev) => {
        const idx = prev.findIndex((p) => p.id === rico.id)
        if (idx === -1) return [rico, ...prev]
        const next = [...prev]; next[idx] = rico; return next
      })
    })

    const unsubEditado = socketService.onPedidoEditado((pedido: Pedido) => {
      const rico = pedido as unknown as PedidoRico
      if (rico.estado === 'anulado') {
        if (tieneAlgoVisible(rico.items, pestaniaRef.current, activasRef.current)) playSound('anulado')
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
      if (tieneAlgoVisible(rico.items, pestaniaRef.current, activasRef.current)) playSound('editado')
      setPedidos((prev) => {
        const idx = prev.findIndex((p) => p.id === rico.id)
        if (idx === -1) return prev
        const next = [...prev]; next[idx] = rico; return next
      })
    })

    const timers = anuladosTimers.current
    return () => {
      unsubNuevo()
      unsubActualizado()
      unsubEditado()
      timers.forEach((t) => clearTimeout(t))
    }
  }, [restauranteId, alEntrarACocina])

  // "Listo" de la pestania: en "Todas" cierra el pedido; en una comanda marca lo pendiente de esa comanda y el backend
  // decide si además lo cierra. Se marca de entrada (la tarjeta pasa a "Listo" en la pestania) y se vuelve atrás si falla.
  const handleListo = useCallback(async (id: string, pestaniaDelClic: Pestania) => {
    setLoadingIds((prev) => new Set(prev).add(id))
    const prev = pedidos.find((p) => p.id === id)
    const ahora = new Date().toISOString()
    setPedidos((all) => all.map((p) => {
      if (p.id !== id) return p
      if (pestaniaDelClic === null) return { ...p, estado: 'listo' }
      const propios = new Set(itemsPropios(p.items, pestaniaDelClic, comandas).map((i) => i.id))
      return { ...p, items: p.items.map((i) => (propios.has(i.id) && i.listoEn === null ? { ...i, listoEn: ahora } : i)) }
    }))
    try {
      const updated = pestaniaDelClic === null
        ? await api.pedidos.cambiarEstado(id, 'listo')
        : await api.pedidos.cambiarEstado(id, 'listo', pestaniaDelClic)
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
  }, [pedidos, comandas])

  // La pestaña se deriva en cada render: si la guardada se desactivó o no existe, vuelve a "Todas" sin tocar localStorage.
  const pestania = pestaniaVigente(eleccion, comandas)
  const activas = idsActivos(comandas)
  const comandasActivas = comandas
    .filter((c) => c.activa)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  useEffect(() => {
    pestaniaRef.current = pestania
    activasRef.current = activas
  })
  const visible = (p: PedidoRico) => tieneAlgoVisible(p.items, pestania, activas)
  const columnaDe = (p: PedidoRico) => columnaDelPedido(p, pestania, comandas)

  const elegir = (id: string | null) => {
    setEleccion(id)
    if (restauranteId) recordarComanda(restauranteId, id)
  }

  const byEstado = (estado: EstadoPedido) => {
    const activos = pedidos
      .filter((p) => columnaDe(p) === estado && visible(p))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    if (estado !== 'en_preparacion') return activos
    const anuladosList = Array.from(anulados.values())
      .filter(visible)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return [...activos, ...anuladosList]
  }

  const totalActivos = pedidos.filter((p) => columnaDe(p) === 'en_preparacion' && visible(p)).length

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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {conectada ? (
            <>
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
            </>
          ) : (
            <button
              onClick={() => void handleConectar()}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'Montserrat,sans-serif' }}
            >
              Conectar impresora
            </button>
          )}
          <button
            onClick={() => { void fetchAll(); void recargarComandas() }}
            disabled={refreshing}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: refreshing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'white', opacity: refreshing ? 0.7 : 1 }}
          >
            <RefreshCw size={12} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
          {trabajaEnVarios && (
            <button
              onClick={() => navigate('/selector')}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter, sans-serif' }}
            >
              Cambiar de restaurante
            </button>
          )}
          <button
            onClick={() => void cerrarSesion()}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter, sans-serif' }}
          >
            <LogOut size={12} />
            Salir
          </button>
        </div>
      </header>

      {comandasActivas.length > 0 && (
        <div
          role="group"
          aria-label="Filtrar por comanda"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 16px 0', flexShrink: 0 }}
        >
          {[{ id: null, nombre: 'Todas' }, ...comandasActivas].map((c) => {
            const seleccionada = c.id === pestania
            return (
              <button
                key={c.id ?? 'todas'}
                aria-pressed={seleccionada}
                onClick={() => elegir(c.id)}
                style={{
                  background: seleccionada ? C.navy : C.white, color: seleccionada ? C.white : C.navy,
                  border: `1px solid ${seleccionada ? C.navy : C.border}`, borderRadius: 999,
                  padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'Montserrat,sans-serif',
                }}
              >
                {c.nombre}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: '10px 20px', fontSize: 13 }}>{error}</div>
      )}

      {/* Kanban — 2 columnas */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: 16, overflow: 'hidden' }}>
        {ESTADOS.map((estado) => {
          const items   = byEstado(estado)
          const colores = ESTADO_COLORS[estado]
          return (
            <div key={estado} role="region" aria-label={ESTADO_LABEL[estado]} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bgLight, borderRadius: 12, border: `1px solid ${C.border}` }}>
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
                      key={`${p.id}|${pestania ?? ''}`}
                      pedido={p}
                      columna={columnaDe(p)}
                      conBoton={puedeMarcarListo(p, pestania, comandas)}
                      onListo={handleListo}
                      loading={loadingIds.has(p.id)}
                      pestania={pestania}
                      activas={activas}
                      impresoraLista={conectada}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .cocina-reimprimir:focus-visible { outline: 2px solid ${C.navy}; outline-offset: 2px; }`}</style>
    </div>
  )
}
