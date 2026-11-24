import type { CSSProperties, ReactNode } from 'react'
import { C } from '../marca/estilos'

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

const estiloDelTitulo: CSSProperties = {
  textAlign: 'left',
  fontFamily: 'Montserrat, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  color: C.navy,
  marginBottom: 6,
}

const estiloDelEncabezado = (columna: Columna): CSSProperties => ({
  fontFamily: 'Inter, sans-serif',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: C.sub,
  padding: '6px 8px',
  textAlign: alineacion(columna),
})

const estiloDeLaCelda = (columna: Columna): CSSProperties => ({
  fontFamily: 'Inter, sans-serif',
  fontSize: 13,
  fontWeight: 400,
  color: C.text,
  padding: '6px 8px',
  textAlign: alineacion(columna),
})

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
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <caption style={estiloDelTitulo}>{titulo}</caption>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            {columnas.map((columna) => (
              <th key={columna.titulo} scope="col" style={estiloDelEncabezado(columna)}>{columna.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => <Fila key={fila.clave} columnas={columnas} celdas={fila.celdas} />)}
        </tbody>
        {pie && (
          <tfoot style={{ borderTop: '1px solid #e5e7eb', fontWeight: 600 }}>
            <Fila columnas={columnas} celdas={pie} negrita />
          </tfoot>
        )}
      </table>
    </div>
  )
}

const alineacion = (columna: Columna): 'left' | 'right' => (columna.numerica ? 'right' : 'left')

/** Una fila: una celda por columna, con la columna como clave. */
function Fila({ columnas, celdas, negrita = false }: { columnas: readonly Columna[]; celdas: ReactNode[]; negrita?: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      {columnas.map((columna, i) => {
        const estilo = { ...estiloDeLaCelda(columna), ...(negrita ? { fontWeight: 600 } : {}) }
        return i === 0
          ? <th key={columna.titulo} scope="row" style={estilo}>{celdas[i]}</th>
          : <td key={columna.titulo} style={estilo}>{celdas[i]}</td>
      })}
    </tr>
  )
}
