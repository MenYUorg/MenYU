import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FilaDeResumen, PagoMercadoPago, ResumenDeTurno } from '@menyu/types'
import { api } from '../services/api'
import { ETIQUETA_DEL_METODO, formatearFechaHora, formatearMonto } from '@menyu/ui/caja'
import { estiloBotonSecundario, estiloCelda, estiloErrorBanda, estiloTexto, estiloTitulo } from './estilosDeCaja'

const C = {
  navy:    '#2D3561',
  white:   '#FFFFFF',
  border:  '#E6E8EF',
  textMut: '#6B7280',
  orange:  '#E8563A',
  red:     '#dc2626',
} as const

type Lectura =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; resumen: ResumenDeTurno }

/**
 * Lo cobrado en el turno que se acaba de cerrar (#359), de GET /turnos/:id/resumen: por método y por mozo, con la propina
 * siempre aparte, y Mercado Pago por separado porque no entra al arqueo. Un error no tapa el arqueo: se ve con
 * "Reintentar". Una lectura vieja que llega tarde no pisa a la nueva.
 */
export function ResumenDelTurno({ turnoId }: { turnoId: string }) {
  const id = useId()
  const [lectura, setLectura] = useState<Lectura>({ estado: 'cargando' })
  const ultimaLectura = useRef(0)

  const leer = useCallback(async () => {
    const pedido = ++ultimaLectura.current
    setLectura({ estado: 'cargando' })
    try {
      const resumen = await api.turnos.resumen(turnoId)
      if (pedido === ultimaLectura.current) setLectura({ estado: 'listo', resumen })
    } catch (e) {
      if (pedido === ultimaLectura.current) {
        setLectura({ estado: 'error', mensaje: e instanceof Error && e.message ? e.message : 'No se pudo leer el resumen del turno' })
      }
    }
  }, [turnoId])

  useEffect(() => { void leer() }, [leer])

  return (
    <section aria-labelledby={`${id}-titulo`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 id={`${id}-titulo`} style={estiloTitulo}>Resumen del turno</h3>
      {lectura.estado === 'cargando' && (
        <p role="status" style={{ ...estiloTexto, color: C.textMut }}>Cargando el resumen del turno…</p>
      )}
      {lectura.estado === 'error' && (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <p style={estiloErrorBanda}>{lectura.mensaje}</p>
          <button
            type="button"
            onClick={() => void leer()}
            style={estiloBotonSecundario()}
          >
            Reintentar
          </button>
        </div>
      )}
      {lectura.estado === 'listo' && <Resumen resumen={lectura.resumen} />}
    </section>
  )
}

function Resumen({ resumen }: { resumen: ResumenDeTurno }) {
  const { porMetodo, porMozo, total, mercadoPago } = resumen
  return (
    <>
      <TablaDeCobros
        titulo="Cobrado por método"
        encabezado="Método"
        filas={porMetodo.map((f) => ({ clave: f.metodo, nombre: ETIQUETA_DEL_METODO[f.metodo], fila: f }))}
        total={total}
      />
      {porMozo.length === 0 ? (
        <p style={{ ...estiloTexto, color: C.textMut }}>No hubo cobros en las cajas de este turno.</p>
      ) : (
        <TablaDeCobros
          titulo="Cobrado por mozo"
          encabezado="Mozo"
          filas={porMozo.map((f) => ({ clave: f.mozoId ?? 'sin-mozo', nombre: f.mozoNombre ?? 'Sin mozo', fila: f }))}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h4 style={{ ...estiloTitulo, fontSize: 13 }}>Mercado Pago</h4>
        <p style={{ ...estiloTexto, color: C.textMut }}>No entra al arqueo: se acredita en la cuenta de Mercado Pago, no en la caja.</p>
        <p style={{ ...estiloTexto, color: C.textMut }}>
          Del {formatearFechaHora(mercadoPago.desde)} al {formatearFechaHora(mercadoPago.hasta)}
        </p>
        {mercadoPago.cantidad === 0 ? (
          <p style={estiloTexto}>No hubo cobros con Mercado Pago.</p>
        ) : (
          <>
            <p style={estiloTexto}>
              {mercadoPago.cantidad === 1 ? '1 cobro' : `${mercadoPago.cantidad} cobros`}: {formatearMonto(mercadoPago.monto)}, y{' '}
              {formatearMonto(mercadoPago.propina)} de propina aparte
            </p>
            <ul aria-label="Pagos con Mercado Pago" style={{ margin: 0, paddingLeft: 18 }}>
              {mercadoPago.pagos.map((p) => <PagoDeMercadoPago key={p.id} pago={p} />)}
            </ul>
          </>
        )}
      </div>
    </>
  )
}

function PagoDeMercadoPago({ pago }: { pago: PagoMercadoPago }) {
  return (
    <li style={estiloTexto}>
      Mesa {pago.mesaNumero} · {formatearFechaHora(pago.fechaCobro)} · {pago.cajaNombre ?? 'Sin caja'} · {formatearMonto(pago.monto)} ·
      propina {formatearMonto(pago.propina)}
      {pago.requiereRevision && <strong style={{ color: C.orange }}> · Requiere revisión</strong>}
    </li>
  )
}

function TablaDeCobros({ titulo, encabezado, filas, total }: {
  titulo: string
  encabezado: string
  filas: { clave: string; nombre: string; fila: FilaDeResumen }[]
  total?: FilaDeResumen
}) {
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <caption style={{ ...estiloTitulo, fontSize: 13, textAlign: 'left', marginBottom: 6 }}>{titulo}</caption>
      <thead>
        <tr>
          {[encabezado, 'Cobros', 'Monto', 'Propina'].map((t) => <th key={t} scope="col" style={estiloCelda(true)}>{t}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map(({ clave, nombre, fila }) => <FilaDeCobros key={clave} nombre={nombre} fila={fila} />)}
      </tbody>
      {total && (
        <tfoot>
          <FilaDeCobros nombre="Total" fila={total} />
        </tfoot>
      )}
    </table>
  )
}

/** La propina va siempre en su columna: nunca se suma al monto. */
function FilaDeCobros({ nombre, fila }: { nombre: string; fila: FilaDeResumen }) {
  return (
    <tr>
      <th scope="row" style={{ ...estiloCelda(false), fontWeight: 600 }}>{nombre}</th>
      <td style={estiloCelda(false)}>{fila.cantidad}</td>
      <td style={estiloCelda(false)}>{formatearMonto(fila.monto)}</td>
      <td style={estiloCelda(false)}>{formatearMonto(fila.propina)}</td>
    </tr>
  )
}

