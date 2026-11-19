import type { FilaDeResumen, ResumenDeTurno } from '@menyu/types'
import { ETIQUETA_DEL_METODO, formatearMonto } from '@menyu/ui/caja'
import { Cargando } from './Cargando'
import { ErrorConReintentar } from './ErrorConReintentar'
import { MercadoPagoDelTurno } from './MercadoPagoDelTurno'
import { Seccion } from './Seccion'
import { TablaDeDatos } from './TablaDeDatos'

/** El resumen de cobros de un turno cerrado (GET /turnos/:id/resumen), o el error de leerlo. */
export type LecturaDelResumen = { estado: 'listo'; resumen: ResumenDeTurno } | { estado: 'error'; mensaje: string }

/** Cantidad, monto y propina: la propina siempre en su columna, nunca sumada al monto. */
const COLUMNAS_DE_COBROS = [
  { titulo: 'Cantidad', numerica: true },
  { titulo: 'Monto', numerica: true },
  { titulo: 'Propina', numerica: true },
]

const cobros = (fila: FilaDeResumen) => [fila.cantidad, formatearMonto(fila.monto), formatearMonto(fila.propina)]

/** Lo cobrado en las cajas del turno, por método (con el total) y por mozo, y Mercado Pago aparte. null = se está leyendo. */
export function ResumenDeCobros({ lectura, onReintentar }: { lectura: LecturaDelResumen | null; onReintentar: () => void }) {
  return (
    <Seccion titulo="Resumen de cobros">
      <Contenido lectura={lectura} onReintentar={onReintentar} />
    </Seccion>
  )
}

function Contenido({ lectura, onReintentar }: { lectura: LecturaDelResumen | null; onReintentar: () => void }) {
  if (lectura === null) return <Cargando etiqueta="Cargando el resumen de cobros" />
  if (lectura.estado === 'error') return <ErrorConReintentar mensaje={lectura.mensaje} onReintentar={onReintentar} />
  const { porMetodo, porMozo, total, mercadoPago } = lectura.resumen
  return (
    <>
      <TablaDeDatos
        titulo="Cobrado por método"
        columnas={[{ titulo: 'Método' }, ...COLUMNAS_DE_COBROS]}
        filas={porMetodo.map((fila) => ({ clave: fila.metodo, celdas: [ETIQUETA_DEL_METODO[fila.metodo], ...cobros(fila)] }))}
        pie={['Total', ...cobros(total)]}
      />
      {porMozo.length > 0 && (
        <TablaDeDatos
          titulo="Cobrado por mozo"
          columnas={[{ titulo: 'Mozo' }, ...COLUMNAS_DE_COBROS]}
          // Los cobros sin mozo van al final, en una sola fila.
          filas={porMozo.map((fila) => ({ clave: fila.mozoId ?? 'sin-mozo', celdas: [fila.mozoNombre ?? 'Sin mozo', ...cobros(fila)] }))}
        />
      )}
      <MercadoPagoDelTurno mercadoPago={mercadoPago} />
    </>
  )
}
