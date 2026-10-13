import { formatearPesos, motivoPrecioBaseIncompatible, porcentajeDesdePrecio } from '../../../utils/descuento'

interface AvisoPrecioConDescuentoProps {
  /** Precio con descuento que tiene hoy el plato. */
  precioDescuento: number
  /** Porcentaje que representa hoy ese descuento. */
  porcentajeDescuento: number | null
  /** Lo que hay escrito en el campo "Precio base". */
  precioTexto: string
}

/** Aviso del formulario de edición: cambiar el precio base de un plato con descuento activo tiene reglas. */
export function AvisoPrecioConDescuento({
  precioDescuento,
  porcentajeDescuento,
  precioTexto,
}: AvisoPrecioConDescuentoProps) {
  const nuevoPrecio = parseFloat(precioTexto)
  const hayPrecio = !Number.isNaN(nuevoPrecio) && nuevoPrecio >= 0
  const motivo = hayPrecio ? motivoPrecioBaseIncompatible(nuevoPrecio, precioDescuento) : null
  const nuevoPorcentaje = hayPrecio && !motivo ? porcentajeDesdePrecio(nuevoPrecio, precioDescuento) : null

  return (
    <div
      style={{
        marginTop:    8,
        background:   motivo ? '#fef2f2' : '#FDE5DF',
        border:       `1px solid ${motivo ? '#fecaca' : '#E8563A'}`,
        borderRadius: 10,
        padding:      '10px 12px',
        fontFamily:   'Inter, sans-serif',
        fontSize:     13,
        color:        motivo ? '#dc2626' : '#374151',
        display:      'flex',
        flexDirection: 'column',
        gap:          4,
      }}
    >
      <span>
        Este plato tiene un descuento activo: <strong>{formatearPesos(precioDescuento)}</strong>
        {porcentajeDescuento != null && <> (-{porcentajeDescuento}%)</>}. El precio base tiene que seguir siendo mayor a
        ese precio; el porcentaje se recalcula con el precio nuevo.
      </span>
      <span aria-live="polite">
        {motivo}
        {!motivo && nuevoPorcentaje?.ok && <>Con este precio base el descuento pasa a ser de <strong>-{nuevoPorcentaje.valor}%</strong>.</>}
      </span>
    </div>
  )
}
