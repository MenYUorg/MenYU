import type { ReactNode } from 'react'

/** Una columna de la tabla: su título y si es un número (va alineada a la derecha). */
export interface Columna {
  titulo: string
  numerica?: boolean
}

/** Una fila: la primera celda es el encabezado de la fila (`th scope="row"`). */
export interface FilaDeTabla {
  clave: string
  celdas: ReactNode[]
}

/**
 * La única tabla del detalle del turno (arqueo, movimientos, cobros por método y por mozo, pagos de Mercado Pago): con
 * su `caption`, los encabezados de columna con `scope="col"`, la primera celda de cada fila con `scope="row"` y un pie
 * opcional (el total).
 */
export function TablaDeDatos({ titulo, columnas, filas, pie }: {
  titulo: string
  columnas: readonly Columna[]
  filas: readonly FilaDeTabla[]
  pie?: ReactNode[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-gray-700">
        <caption className="text-left text-sm font-medium text-gray-900 mb-1">{titulo}</caption>
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            {columnas.map((columna) => (
              <th key={columna.titulo} scope="col" className={`py-1.5 px-2 font-medium ${alineacion(columna)}`}>{columna.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => <Fila key={fila.clave} columnas={columnas} celdas={fila.celdas} />)}
        </tbody>
        {pie && (
          <tfoot className="border-t border-gray-200 font-medium text-gray-900">
            <Fila columnas={columnas} celdas={pie} />
          </tfoot>
        )}
      </table>
    </div>
  )
}

const alineacion = (columna: Columna) => (columna.numerica ? 'text-right' : 'text-left')

/** Una fila: una celda por columna, con la columna como clave. */
function Fila({ columnas, celdas }: { columnas: readonly Columna[]; celdas: ReactNode[] }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      {columnas.map((columna, i) => {
        const clase = `py-1.5 px-2 ${alineacion(columna)}`
        return i === 0
          ? <th key={columna.titulo} scope="row" className={`${clase} font-normal`}>{celdas[i]}</th>
          : <td key={columna.titulo} className={clase}>{celdas[i]}</td>
      })}
    </tr>
  )
}
