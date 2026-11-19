import type { ResumenMercadoPago } from '@menyu/types'
import { formatearFechaHoraCompleta, formatearMonto } from '@menyu/ui/caja'
import { Seccion } from './Seccion'
import { TablaDeDatos } from './TablaDeDatos'

const COLUMNAS_DE_PAGOS = [
  { titulo: 'Fecha' },
  { titulo: 'Mesa' },
  { titulo: 'Caja' },
  { titulo: 'Monto', numerica: true },
  { titulo: 'Propina', numerica: true },
  { titulo: 'Revisión' },
]

/** Mercado Pago del turno, aparte: es informativo y no entra al arqueo. La propina va siempre en su columna. */
export function MercadoPagoDelTurno({ mercadoPago }: { mercadoPago: ResumenMercadoPago }) {
  const { desde, hasta, cantidad, monto, propina, pagos } = mercadoPago
  return (
    <Seccion titulo="Mercado Pago">
      <p className="text-sm text-gray-500">Informativo: lo cobrado con Mercado Pago se acredita en la cuenta y no entra al arqueo.</p>
      <p className="text-sm text-gray-700">
        {`Del ${formatearFechaHoraCompleta(desde)} al ${formatearFechaHoraCompleta(hasta)}: ${cantidad} ${cantidad === 1 ? 'cobro' : 'cobros'}, monto ${formatearMonto(monto)}, propina ${formatearMonto(propina)}`}
      </p>
      {pagos.length === 0 ? (
        <p className="text-sm text-gray-500">Sin pagos de Mercado Pago en el turno.</p>
      ) : (
        <TablaDeDatos
          titulo="Pagos de Mercado Pago"
          columnas={COLUMNAS_DE_PAGOS}
          filas={pagos.map((pago) => ({
            clave: pago.id,
            celdas: [
              formatearFechaHoraCompleta(pago.fechaCobro),
              pago.mesaNumero,
              pago.cajaNombre ?? 'Sin caja',
              formatearMonto(pago.monto),
              formatearMonto(pago.propina),
              pago.requiereRevision ? 'Requiere revisión' : '',
            ],
          }))}
        />
      )}
    </Seccion>
  )
}
