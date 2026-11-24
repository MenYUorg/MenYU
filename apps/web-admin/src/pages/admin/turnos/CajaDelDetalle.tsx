import type { CajaDelDetalle as Caja, FilaDeArqueo, MovimientoDeCaja } from '@menyu/types'
import { ETIQUETA_DEL_METODO, formatearFechaHoraCompleta, formatearMonto, textoDeDiferencia } from '@menyu/ui/caja'
import { bloqueInterno } from '../cajas/estilos'
import { NombreYFondo } from './NombreYFondo'
import { SinArqueo } from './SinArqueo'
import { TablaDeDatos } from './TablaDeDatos'
import { totalesDeMovimientos } from './historial'

const COLUMNAS_DEL_ARQUEO = [
  { titulo: 'Método' },
  { titulo: 'Esperado', numerica: true },
  { titulo: 'Declarado', numerica: true },
  { titulo: 'Diferencia', numerica: true },
]

const COLUMNAS_DE_MOVIMIENTOS = [
  { titulo: 'Fecha' },
  { titulo: 'Tipo' },
  { titulo: 'Monto', numerica: true },
  { titulo: 'Motivo' },
  { titulo: 'Cargó' },
]

/**
 * Una caja del turno en el detalle: el fondo inicial y la lista de movimientos. Con el turno cerrado, también el arqueo
 * y los totales de los movimientos; con el turno abierto no (arqueo ciego).
 */
export function CajaDelDetalle({ caja, cerrado }: { caja: Caja; cerrado: boolean }) {
  return (
    <section aria-label={`Caja ${caja.nombre}`} style={{ ...bloqueInterno, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NombreYFondo nombre={caja.nombre} fondoInicial={caja.fondoInicial} />
      {cerrado && (caja.arqueo === null ? <SinArqueo /> : <TablaDelArqueo nombre={caja.nombre} arqueo={caja.arqueo} />)}
      <MovimientosDeLaCaja nombre={caja.nombre} movimientos={caja.movimientos} cerrado={cerrado} />
    </section>
  )
}

function TablaDelArqueo({ nombre, arqueo }: { nombre: string; arqueo: FilaDeArqueo[] }) {
  return (
    <TablaDeDatos
      titulo={`Arqueo de ${nombre}`}
      columnas={COLUMNAS_DEL_ARQUEO}
      filas={arqueo.map((fila) => ({
        clave: fila.metodo,
        celdas: [ETIQUETA_DEL_METODO[fila.metodo], formatearMonto(fila.esperado), formatearMonto(fila.declarado), textoDeDiferencia(fila.diferencia)],
      }))}
    />
  )
}

function MovimientosDeLaCaja({ nombre, movimientos, cerrado }: { nombre: string; movimientos: MovimientoDeCaja[]; cerrado: boolean }) {
  if (movimientos.length === 0) return <p>Sin movimientos</p>
  const totales = totalesDeMovimientos(movimientos)
  return (
    <>
      <TablaDeDatos
        titulo={`Movimientos de ${nombre}`}
        columnas={COLUMNAS_DE_MOVIMIENTOS}
        filas={movimientos.map((m) => ({
          clave: m.id,
          celdas: [formatearFechaHoraCompleta(m.createdAt), m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso', formatearMonto(m.monto), m.motivo, m.usuario.nombre],
        }))}
      />
      {cerrado && <p>Total de ingresos: {formatearMonto(totales.ingresos)} · Total de egresos: {formatearMonto(totales.egresos)}</p>}
    </>
  )
}
