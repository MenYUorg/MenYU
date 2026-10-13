import { useEffect, useId, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { ItemMenu, UpdateItemDescuentoRequest } from '@menyu/types'
import {
  formatearPesos,
  parsearEntero,
  porcentajeDesdePrecio,
  precioDesdePorcentaje,
  seRedondea,
} from '../../../utils/descuento'
import { mensajeDeError } from '../../../utils/mensajeDeError'

interface DescuentoModalProps {
  /** Plato al que se le carga el descuento. Con null el modal queda cerrado. */
  item: ItemMenu | null
  onClose: () => void
  onGuardar: (id: string, data: UpdateItemDescuentoRequest) => Promise<unknown>
  onQuitar: (id: string) => Promise<unknown>
}

type Modo = 'precio' | 'porcentaje'
type Trabajo = 'guardando' | 'quitando' | null

type Evaluacion =
  | { estado: 'vacio' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'ok'; precio: number; porcentaje: number; redondeado: boolean }

const C = {
  navy:   '#2D3561',
  orange: '#E8563A',
  border: '#e5e7eb',
  text:   '#111827',
  sub:    '#6b7280',
  muted:  '#9ca3af',
  red:    '#dc2626',
  bg:     '#f9fafb',
} as const

// Botones de al menos 44px de alto para poder tocarlos desde el celular.
const boton: React.CSSProperties = {
  minHeight:      44,
  padding:        '0 18px',
  borderRadius:   10,
  fontFamily:     'Montserrat, sans-serif',
  fontWeight:     600,
  fontSize:       13,
  cursor:         'pointer',
  display:        'inline-flex',
  alignItems:     'center',
  justifyContent: 'center',
}

const campo: React.CSSProperties = {
  width:        '100%',
  boxSizing:    'border-box',
  minHeight:    44,
  border:       `1px solid ${C.border}`,
  borderRadius: 10,
  padding:      '0 12px',
  fontFamily:   'Inter, sans-serif',
  // 16px evita que iOS haga zoom al enfocar el campo.
  fontSize:     16,
  color:        C.text,
  background:   'white',
}

const etiqueta: React.CSSProperties = {
  display:      'block',
  fontFamily:   'Inter, sans-serif',
  fontWeight:   500,
  fontSize:     13,
  color:        '#374151',
  marginBottom: 6,
}

export function DescuentoModal({ item, onClose, onGuardar, onQuitar }: DescuentoModalProps) {
  if (!item) return null
  // Con key se reinicia el formulario al abrirlo para otro plato.
  return <FormularioDescuento key={item.id} item={item} onClose={onClose} onGuardar={onGuardar} onQuitar={onQuitar} />
}

function FormularioDescuento({
  item,
  onClose,
  onGuardar,
  onQuitar,
}: Omit<DescuentoModalProps, 'item'> & { item: ItemMenu }) {
  const idTitulo = useId()
  const idPrecio = useId()
  const idPorcentaje = useId()
  const idVistaPrevia = useId()

  const base = Number(item.precioBase)
  const sinPrecioBase = !(base > 0)
  const descuentoActual = item.precioDescuento ?? null

  // Con un descuento cargado se parte de su precio; si no, del porcentaje, que es como suele pensarse.
  const [modo, setModo] = useState<Modo>(descuentoActual != null ? 'precio' : 'porcentaje')
  const [texto, setTexto] = useState(descuentoActual != null ? String(descuentoActual) : '')
  const [trabajo, setTrabajo] = useState<Trabajo>(null)
  const [error, setError] = useState<string | null>(null)
  const ocupado = trabajo !== null

  const evaluacion = useMemo<Evaluacion>(() => {
    if (texto.trim() === '') return { estado: 'vacio' }
    const numero = parsearEntero(texto)
    if (numero === null) return { estado: 'invalido', motivo: 'Ingresá un número entero, sin decimales' }
    if (modo === 'precio') {
      const r = porcentajeDesdePrecio(base, numero)
      return r.ok
        ? { estado: 'ok', precio: numero, porcentaje: r.valor, redondeado: false }
        : { estado: 'invalido', motivo: r.motivo }
    }
    const r = precioDesdePorcentaje(base, numero)
    return r.ok
      ? { estado: 'ok', precio: r.valor, porcentaje: numero, redondeado: seRedondea(base, numero) }
      : { estado: 'invalido', motivo: r.motivo }
  }, [texto, modo, base])

  // El campo que se está escribiendo muestra lo tipeado; el otro muestra lo que se calcula.
  const valorPrecio = modo === 'precio' ? texto : evaluacion.estado === 'ok' ? String(evaluacion.precio) : ''
  const valorPorcentaje =
    modo === 'porcentaje' ? texto : evaluacion.estado === 'ok' ? String(evaluacion.porcentaje) : ''

  const sinCambios = evaluacion.estado === 'ok' && descuentoActual != null && evaluacion.precio === descuentoActual
  const puedeGuardar = evaluacion.estado === 'ok' && !sinCambios && !ocupado && !sinPrecioBase

  // Escape cierra el modal, salvo que se esté guardando.
  useEffect(() => {
    function alApretarTecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !ocupado) onClose()
    }
    document.addEventListener('keydown', alApretarTecla)
    return () => document.removeEventListener('keydown', alApretarTecla)
  }, [ocupado, onClose])

  async function guardar() {
    if (evaluacion.estado !== 'ok') return
    setError(null)
    setTrabajo('guardando')
    try {
      await onGuardar(
        item.id,
        modo === 'precio' ? { precioDescuento: evaluacion.precio } : { porcentaje: evaluacion.porcentaje },
      )
      onClose()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el descuento. Probá de nuevo.'))
      setTrabajo(null)
    }
  }

  async function quitar() {
    setError(null)
    setTrabajo('quitando')
    try {
      await onQuitar(item.id)
      onClose()
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo quitar el descuento. Probá de nuevo.'))
      setTrabajo(null)
    }
  }

  return (
    <div
      onClick={() => {
        if (!ocupado) onClose()
      }}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.5)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        12,
        zIndex:         200,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onClick={(e) => e.stopPropagation()}
        style={{
          background:    'white',
          width:         480,
          maxWidth:      '100%',
          maxHeight:     '90dvh',
          borderRadius:  16,
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            gap:            12,
            padding:        '16px 20px',
            borderBottom:   `1px solid ${C.border}`,
            flexShrink:     0,
          }}
        >
          <h2
            id={idTitulo}
            style={{
              fontFamily:   'Montserrat, sans-serif',
              fontWeight:   700,
              fontSize:     18,
              color:        C.navy,
              margin:       0,
              minWidth:     0,
              overflow:     'hidden',
              overflowWrap: 'anywhere',
              display:      '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            Descuento — {item.nombre}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={ocupado}
            aria-label="Cerrar"
            style={{
              background:     'none',
              border:         'none',
              cursor:         ocupado ? 'not-allowed' : 'pointer',
              color:          C.muted,
              width:          44,
              height:         44,
              flexShrink:     0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              borderRadius:   8,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo */}
        <div
          style={{
            flex:               1,
            overflowY:          'auto',
            overscrollBehavior: 'contain',
            padding:            20,
            display:            'flex',
            flexDirection:      'column',
            gap:                16,
          }}
        >
          <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 14, color: C.sub }}>
            Precio original: <strong style={{ color: C.text }}>{formatearPesos(base)}</strong>
          </p>

          {sinPrecioBase ? (
            <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.red }}>
              Este plato no tiene precio base: no se le puede aplicar un descuento.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <label htmlFor={idPorcentaje} style={etiqueta}>
                    Porcentaje de descuento (%)
                  </label>
                  <input
                    id={idPorcentaje}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus={descuentoActual == null}
                    value={valorPorcentaje}
                    placeholder="Ej: 20"
                    disabled={ocupado}
                    aria-describedby={idVistaPrevia}
                    onChange={(e) => {
                      setModo('porcentaje')
                      setTexto(e.target.value)
                      setError(null)
                    }}
                    style={campo}
                  />
                </div>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <label htmlFor={idPrecio} style={etiqueta}>
                    Precio con descuento ($)
                  </label>
                  <input
                    id={idPrecio}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus={descuentoActual != null}
                    value={valorPrecio}
                    placeholder="Ej: 1200"
                    disabled={ocupado}
                    aria-describedby={idVistaPrevia}
                    onChange={(e) => {
                      setModo('precio')
                      setTexto(e.target.value)
                      setError(null)
                    }}
                    style={campo}
                  />
                </div>
              </div>

              {/* Vista previa en vivo */}
              <div
                id={idVistaPrevia}
                aria-live="polite"
                style={{
                  background:   C.bg,
                  border:       `1px solid ${C.border}`,
                  borderRadius: 12,
                  padding:      '12px 14px',
                  minHeight:    64,
                  display:      'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap:          4,
                }}
              >
                {evaluacion.estado === 'vacio' && (
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.sub }}>
                    Cargá el porcentaje o el precio con descuento: el otro se calcula solo.
                  </span>
                )}
                {evaluacion.estado === 'invalido' && (
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: C.red }}>
                    {evaluacion.motivo}
                  </span>
                )}
                {evaluacion.estado === 'ok' && (
                  <>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.sub }}>
                      Así lo van a ver los clientes
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontFamily:     'Inter, sans-serif',
                          fontSize:       13,
                          color:          C.muted,
                          textDecoration: 'line-through',
                        }}
                      >
                        {formatearPesos(base)}
                      </span>
                      <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 20, color: C.orange }}>
                        {formatearPesos(evaluacion.precio)}
                      </span>
                      <span
                        style={{
                          background:   C.orange,
                          color:        'white',
                          borderRadius: 999,
                          padding:      '2px 8px',
                          fontFamily:   'Montserrat, sans-serif',
                          fontWeight:   700,
                          fontSize:     12,
                        }}
                      >
                        -{evaluacion.porcentaje}%
                      </span>
                    </span>
                    {evaluacion.redondeado && (
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.sub }}>
                        El precio se redondea al peso más cercano.
                      </span>
                    )}
                    {sinCambios && (
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.sub }}>
                        Es el descuento que ya tiene este plato.
                      </span>
                    )}
                  </>
                )}
              </div>

              <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.sub }}>
                El descuento vale hasta que lo quites. Se aplica al precio del plato; los extras se cobran a su precio
                normal.
              </p>
            </>
          )}

          {error && (
            <p
              role="alert"
              style={{
                margin:       0,
                fontFamily:   'Inter, sans-serif',
                fontSize:     13,
                color:        C.red,
                background:   '#fef2f2',
                border:       '1px solid #fecaca',
                borderRadius: 10,
                padding:      '10px 12px',
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Pie */}
        <div
          style={{
            display:        'flex',
            flexWrap:       'wrap',
            alignItems:     'center',
            justifyContent: descuentoActual != null ? 'space-between' : 'flex-end',
            gap:            10,
            padding:        '14px 20px',
            borderTop:      `1px solid ${C.border}`,
            flexShrink:     0,
          }}
        >
          {descuentoActual != null && (
            <button
              type="button"
              onClick={() => void quitar()}
              disabled={ocupado}
              style={{
                ...boton,
                background:  'white',
                color:       C.red,
                border:      '1px solid #fecaca',
                opacity:     ocupado ? 0.55 : 1,
                cursor:      ocupado ? 'not-allowed' : 'pointer',
              }}
            >
              {trabajo === 'quitando' ? 'Quitando…' : 'Quitar descuento'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={ocupado}
              style={{ ...boton, background: 'white', color: '#374151', border: `1px solid ${C.border}` }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={!puedeGuardar}
              style={{
                ...boton,
                background: C.orange,
                color:      'white',
                border:     'none',
                opacity:    puedeGuardar ? 1 : 0.55,
                cursor:     puedeGuardar ? 'pointer' : 'not-allowed',
              }}
            >
              {trabajo === 'guardando' ? 'Guardando…' : descuentoActual != null ? 'Actualizar descuento' : 'Guardar descuento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
