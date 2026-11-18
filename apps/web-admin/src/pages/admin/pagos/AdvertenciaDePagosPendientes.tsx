const C = {
  orange:     '#E8563A',
  orangeSoft: '#FDF0ED',
  border:     '#E6E8EF',
  white:      '#FFFFFF',
  text:       '#1F2333',
} as const

interface AdvertenciaDePagosPendientesProps {
  /** El texto del 409 del backend: los pagos de Mercado Pago de comensales que se cancelarían. */
  mensaje: string
  onCancelar: () => void
  /** Repite el mismo cobro con `confirmarCancelacionPagosPendientes: true`. */
  onConfirmar: () => void
}

/**
 * La advertencia del 409 al cobrar la mesa completa con pagos de Mercado Pago pendientes (#360): mismo flujo y textos que
 * el cobro de web-staff. Confirmar repite la misma llamada; mientras se envía, la advertencia se cierra y el modal muestra
 * "Registrando…" en su botón.
 */
export function AdvertenciaDePagosPendientes({ mensaje, onCancelar, onConfirmar }: AdvertenciaDePagosPendientesProps) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 8,
      background: C.orangeSoft, border: `1px solid ${C.orange}`,
      fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text,
    }}>
      <div style={{ marginBottom: 14 }}>{mensaje}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancelar}
          style={{
            padding: '10px 18px', borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.white,
            fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.text, cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmar}
          style={{
            padding: '10px 22px', borderRadius: 8, border: 'none', background: C.orange,
            fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.white, cursor: 'pointer',
          }}
        >
          Confirmar y cobrar mesa completa
        </button>
      </div>
    </div>
  )
}
