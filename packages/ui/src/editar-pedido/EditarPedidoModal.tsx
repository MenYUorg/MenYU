import { useState } from 'react'
import { X } from 'lucide-react'

// Modal "Editar pedido": ajustar la cantidad de cada ítem con una justificación de hasta 50 palabras.
// Lo usan el gerente (web-admin: pedidos, historial y sesiones) y el mozo (web-staff: pedidos).
// No conoce la API: cada app pasa `onGuardar` con su endpoint y lo que hace al terminar.

/** Un ítem del pedido tal como se edita: la cantidad actual es la editada si la hubo, si no la original. */
export interface ItemEditable {
  id: string
  nombre: string
  cantidadActual: number
  precioUnitario: number
}

/** Lo que el modal pide guardar: solo los ítems cuya cantidad cambió. */
export interface EdicionDePedido {
  justificacion: string
  ediciones: { pedidoItemId: string; cantidadNueva: number }[]
}

/**
 * Cómo se ve el modal. Hay dos diseños (el del historial de sesiones y el de las pantallas de pedidos);
 * unificarlos cambia lo que ve el usuario, así que es una decisión aparte de este componente.
 */
export interface AparienciaEditarPedido {
  fondo: string
  radio: number
  sombra: string
  /** Botones − y + redondos, con borde gris claro al deshabilitarse y resaltado al pasar el mouse. */
  pasosRedondos: boolean
  /** Fondo y borde de la fila según cambió o quedó en cero. */
  fila: (cambio: boolean, anulado: boolean) => { background: string; border?: string }
  /** `transition` de la fila; sin valor, la fila no anima. */
  transicionFila?: string
  /** `transition` del botón "Guardar edición"; sin valor, no anima. */
  transicionGuardar?: string
  tacharAnulado: boolean
  colorCantidadAnulada: string
}

export const APARIENCIA_HISTORIAL: AparienciaEditarPedido = {
  fondo:  'rgba(45,53,97,0.55)',
  radio:  16,
  sombra: '0 24px 60px rgba(31,35,51,0.30)',
  pasosRedondos: true,
  fila: (cambio, anulado) => {
    if (cambio && anulado) return { background: '#FEE2E2', border: '1px solid #FECACA' }
    if (cambio)            return { background: '#FDF0ED', border: '1px solid #F6C4B8' }
    return { background: 'transparent', border: '1px solid transparent' }
  },
  transicionFila:    'background 0.15s, border-color 0.15s',
  transicionGuardar: 'background 0.15s',
  tacharAnulado: true,
  colorCantidadAnulada: '#E8563A',
}

export const APARIENCIA_PEDIDOS: AparienciaEditarPedido = {
  fondo:  'rgba(0,0,0,0.5)',
  radio:  12,
  sombra: '0 20px 60px rgba(0,0,0,0.2)',
  pasosRedondos: false,
  fila: (cambio, anulado) => ({ background: cambio ? (anulado ? '#FEF2F0' : '#FFF7ED') : 'transparent' }),
  transicionFila:    'background 0.15s',
  transicionGuardar: 'background 0.15s',
  tacharAnulado: false,
  colorCantidadAnulada: '#DC2626',
}

const MAX_PALABRAS = 50

export function contarPalabras(texto: string): number {
  return texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length
}

function StepBtn({
  label,
  onClick,
  disabled,
  redondo,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  redondo: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={redondo ? () => !disabled && setHovered(true) : undefined}
      onMouseLeave={redondo ? () => setHovered(false) : undefined}
      style={{
        width:          28,
        height:         28,
        borderRadius:   redondo ? '50%' : 6,
        border:         redondo ? `1px solid ${disabled ? '#E5E7EB' : '#D1D5DB'}` : '1px solid #D1D5DB',
        background:     disabled ? '#F9FAFB' : redondo && hovered ? '#EEF0F8' : 'white',
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
        transition:     redondo ? 'background 0.12s' : undefined,
      }}
    >
      {label}
    </button>
  )
}

export function EditarPedidoModal({
  codigo,
  items,
  pagado = false,
  apariencia,
  onGuardar,
  onClose,
}: {
  /** Lo que sigue a "Editar pedido" en el título, ya formateado (p. ej. "#AB12CD34"). */
  codigo: string
  items: ItemEditable[]
  /** Un pedido pagado no se edita: se avisa en lugar del formulario. */
  pagado?: boolean
  apariencia: AparienciaEditarPedido
  /** Guarda la edición. Si falla, el modal muestra el error y deja reintentar. */
  onGuardar: (edicion: EdicionDePedido) => Promise<void>
  onClose: () => void
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.cantidadActual])),
  )
  const [justificacion, setJustificacion] = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  const words = contarPalabras(justificacion)

  const ediciones = items
    .filter((item) => quantities[item.id] !== item.cantidadActual)
    .map((item) => ({ pedidoItemId: item.id, cantidadNueva: quantities[item.id] }))

  const hasChanges    = ediciones.length > 0
  const todosAnulados = items.every((item) => quantities[item.id] === 0)
  const canSubmit     = hasChanges && justificacion.trim().length > 0 && words <= MAX_PALABRAS && !submitting && !pagado

  function setQty(id: string, val: number) {
    setQuantities((prev) => ({ ...prev, [id]: val }))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await onGuardar({ justificacion: justificacion.trim(), ediciones })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al editar pedido')
      setSubmitting(false)
    }
  }

  const formulario = (
    <>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6B7280', margin: '0 0 16px' }}>
        Ajustá la cantidad de cada ítem. Solo se registran los ítems que cambian.
      </p>

      {/* Stepper por ítem */}
      <div style={{ marginBottom: 16 }}>
        {items.map((item) => {
          const actual  = item.cantidadActual
          const current = quantities[item.id]
          const changed = current !== actual
          const anulado = current === 0
          const fila    = apariencia.fila(changed, anulado)
          const tachar  = apariencia.tacharAnulado

          return (
            <div
              key={item.id}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          12,
                padding:      '8px 10px',
                borderRadius: 8,
                background:   fila.background,
                border:       fila.border,
                marginBottom: 4,
                transition:   apariencia.transicionFila,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily:     'Inter, sans-serif',
                    fontSize:       13,
                    color:          tachar && anulado ? '#DC2626' : '#374151',
                    textDecoration: tachar ? (anulado ? 'line-through' : 'none') : undefined,
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
                  redondo={apariencia.pasosRedondos}
                />
                <span
                  style={{
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 700,
                    fontSize:   14,
                    color:      anulado ? apariencia.colorCantidadAnulada : '#2D3561',
                    minWidth:   20,
                    textAlign:  'center',
                  }}
                >
                  {current}
                </span>
                <StepBtn
                  label="+"
                  onClick={() => setQty(item.id, Math.min(actual, current + 1))}
                  disabled={current === actual}
                  redondo={apariencia.pasosRedondos}
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
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: words > MAX_PALABRAS ? '#E8563A' : '#9CA3AF' }}>
            {words}/{MAX_PALABRAS} palabras
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
            border:       `1px solid ${words > MAX_PALABRAS ? '#E8563A' : '#D1D5DB'}`,
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
            transition:   apariencia.transicionGuardar,
          }}
        >
          {submitting ? 'Guardando…' : 'Guardar edición'}
        </button>
      </div>
    </>
  )

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         1000,
        background:     apariencia.fondo,
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
          borderRadius: apariencia.radio,
          width:        '100%',
          maxWidth:     500,
          padding:      24,
          boxShadow:    apariencia.sombra,
          maxHeight:    '90vh',
          overflowY:    'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 16, color: '#2D3561', margin: 0 }}>
            Editar pedido {codigo}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {pagado ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#DC2626', margin: 0 }}>
            Este pedido ya fue pagado y no puede editarse.
          </p>
        ) : formulario}
      </div>
    </div>
  )
}
