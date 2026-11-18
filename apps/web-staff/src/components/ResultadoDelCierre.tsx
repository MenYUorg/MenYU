import { useId } from 'react'
import type { ArqueoDeCaja } from '@menyu/types'
import {
  clasificarDiferencia,
  ETIQUETA_DEL_METODO,
  textoDeDiferencia,
  type ResultadoDelCierre as Resultado,
} from '../utils/cierre'
import { formatearFechaHora, formatearMonto } from '../utils/formato'

const C = {
  orange:   '#E8563A',
  orangeBg: '#FDF0ED',
  navy:     '#2D3561',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  textMut:  '#6B7280',
  green:    '#1F9D57',
  red:      '#dc2626',
} as const

const COLOR_DE_LA_DIFERENCIA = { 'sin-diferencia': C.textMut, sobra: C.green, falta: C.red } as const

interface ResultadoDelCierreProps {
  resultado: Resultado
  /** "Abrir un turno nuevo": la pantalla vuelve a leer el turno y descarta este resultado. */
  onNuevoTurno: () => void
}

/** Lleva el foco a un elemento cuando se monta. Es estable: React no la vuelve a llamar en cada render. */
const enfocarAlMontar = (el: HTMLElement | null) => el?.focus()

/**
 * Lo que queda en pantalla después de cerrar el turno (#359): el arqueo de cada caja (esperado, declarado y la
 * diferencia con palabras) y las mesas que quedaron abiertas. Recién acá se ve el esperado: mientras el turno está
 * abierto, el arqueo es ciego.
 */
export function ResultadoDelCierre({ resultado, onNuevoTurno }: ResultadoDelCierreProps) {
  const id = useId()
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <h2 id={`${id}-titulo`} ref={enfocarAlMontar} tabIndex={-1} style={{ ...estiloTitulo, fontSize: 16, outline: 'none' }}>
        Turno cerrado
      </h2>
      <p style={{ ...estiloTexto, color: C.textMut }}>Cerrado el {formatearFechaHora(resultado.cerradoEn)}</p>

      <AvisoDeMesasAbiertas mesas={resultado.mesasAbiertas} />

      {resultado.arqueos.map((arqueo) => <TablaDeArqueo key={arqueo.cajaId} arqueo={arqueo} />)}

      <div>
        <button
          type="button"
          onClick={onNuevoTurno}
          style={{
            padding: '10px 22px', borderRadius: 10, border: 'none', background: C.orange, color: C.white,
            fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          Abrir un turno nuevo
        </button>
      </div>
    </section>
  )
}

function AvisoDeMesasAbiertas({ mesas }: { mesas: Resultado['mesasAbiertas'] }) {
  if (mesas === null) return <p role="alert" style={estiloAviso}>No se pudo comprobar si quedaron mesas abiertas.</p>
  if (mesas.length === 0) return null
  return (
    <div role="alert" style={estiloAviso}>
      <p style={estiloTexto}>Quedaron mesas abiertas. Sin un turno abierto no se pueden cobrar hasta que se abra uno nuevo.</p>
      <ul aria-label="Mesas que quedaron abiertas" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {mesas.map((m) => <li key={m.mesaId} style={estiloTexto}>Mesa {m.mesaNumero} · desde {formatearFechaHora(m.iniciadaEn)}</li>)}
      </ul>
    </div>
  )
}

function TablaDeArqueo({ arqueo }: { arqueo: ArqueoDeCaja }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <caption style={{ ...estiloTitulo, textAlign: 'left', marginBottom: 6 }}>Arqueo de la caja «{arqueo.cajaNombre}»</caption>
        <thead>
          <tr>
            {['Método', 'Esperado', 'Declarado', 'Diferencia'].map((titulo) => (
              <th key={titulo} scope="col" style={estiloCelda(true)}>{titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {arqueo.metodos.map((fila) => (
            <tr key={fila.metodo}>
              <th scope="row" style={{ ...estiloCelda(false), fontWeight: 600 }}>{ETIQUETA_DEL_METODO[fila.metodo]}</th>
              <td style={estiloCelda(false)}>{formatearMonto(fila.esperado)}</td>
              <td style={estiloCelda(false)}>{formatearMonto(fila.declarado)}</td>
              <td style={{ ...estiloCelda(false), color: COLOR_DE_LA_DIFERENCIA[clasificarDiferencia(fila.diferencia)], fontWeight: 600 }}>
                {textoDeDiferencia(fila.diferencia)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ ...estiloTexto, color: C.textMut }}>Fondo inicial: {formatearMonto(arqueo.fondoInicial)}</p>
    </div>
  )
}

const estiloTitulo = { fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy, margin: 0 } as const
const estiloTexto = { fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, margin: 0 } as const
const estiloAviso = {
  margin: 0, background: C.orangeBg, border: `1px solid ${C.orange}`, borderRadius: 10, padding: '10px 14px',
  fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy,
} as const
const estiloCelda = (encabezado: boolean) => ({
  textAlign: 'left' as const, padding: '6px 8px', borderBottom: `1px solid ${C.border}`,
  fontFamily: encabezado ? 'Montserrat,sans-serif' : 'Inter,sans-serif',
  fontWeight: encabezado ? 700 : 400, fontSize: encabezado ? 12 : 13,
  color: encabezado ? C.textMut : C.navy,
})
