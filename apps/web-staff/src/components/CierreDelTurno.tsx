import { useEffect, useId, useRef, useState } from 'react'
import type { CerrarTurnoBody, TurnoDeCaja } from '@menyu/types'
import { api, ApiError } from '../services/api'
import { useCajasStore } from '../store/cajasStore'
import { MENSAJE_TURNO_CERRADO } from '../utils/conflictosDeCaja'
import {
  leerCierre,
  mesasAbiertasDeSesiones,
  METODOS_DE_ARQUEO,
  primerCampoConError,
  resultadoDesdeElCierre,
  resultadoDesdeElDetalle,
  textoDeMesaAbiertaPrevia,
  type CampoDelCierre,
  type MesaAbiertaPrevia,
  type PorCajaYMetodo,
  type ResultadoDelCierre,
} from '../utils/cierre'
import { formatearMonto } from '../utils/formato'
import { MAXIMO_DE_OBSERVACIONES } from '../utils/observaciones'

const C = {
  orange:   '#E8563A',
  orangeBg: '#FDF0ED',
  navy:     '#2D3561',
  white:    '#FFFFFF',
  border:   '#E6E8EF',
  textMut:  '#6B7280',
  red:      '#dc2626',
} as const

type Confirmacion = { paso: 'confirmando'; body: CerrarTurnoBody; enviando: boolean; error: string | null }

type Paso =
  | { paso: 'cerrado' }
  | { paso: 'revisando' }
  | { paso: 'declarando' }
  | Confirmacion

interface CierreDelTurnoProps {
  turno: TurnoDeCaja
  restauranteId: string
  /** El turno se cerró: la pantalla muestra el resultado. */
  onCerrado: (resultado: ResultadoDelCierre) => void
  /** El turno ya estaba cerrado: la pantalla vuelve a leer el turno actual y muestra `mensaje`. */
  onTurnoCambio: (mensaje: string) => void
}

/** Lleva el foco a un elemento cuando se monta. Es estable: React no la vuelve a llamar en cada render. */
const enfocarAlMontar = (el: HTMLElement | null) => el?.focus()

const idDelCampo = (base: string, cajaId: string, metodo: string) => `${base}-${cajaId}-${metodo}`

/**
 * Cerrar el turno (#359): revisa las mesas abiertas (avisa, no bloquea), pide lo contado en cada caja por método sin
 * mostrar el esperado (arqueo ciego) y, después de una confirmación, cierra todas las cajas juntas. El esperado y la
 * diferencia los calcula el backend y se ven recién en el resultado.
 */
export function CierreDelTurno({ turno, restauranteId, onCerrado, onTurnoCambio }: CierreDelTurnoProps) {
  const id = useId()
  const [paso, setPaso] = useState<Paso>({ paso: 'cerrado' })
  // null: no se pudo revisar; []: se revisó y no hay.
  const [mesasPrevias, setMesasPrevias] = useState<MesaAbiertaPrevia[] | null>([])
  const [valores, setValores] = useState<PorCajaYMetodo>({})
  const [observaciones, setObservaciones] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [foco, setFoco] = useState<CampoDelCierre | null>(null)
  // Una revisión cancelada (o vieja) que responde tarde no reabre el formulario.
  const ultimaRevision = useRef(0)

  useEffect(() => {
    if (foco) document.getElementById(idDelCampo(id, foco.cajaId, foco.metodo))?.focus()
  }, [foco, id])

  async function revisar() {
    const revision = ++ultimaRevision.current
    setPaso({ paso: 'revisando' })
    let mesas: MesaAbiertaPrevia[] | null
    try {
      mesas = mesasAbiertasDeSesiones(await api.sesiones.getActivas(restauranteId))
    } catch {
      mesas = null
    }
    if (revision !== ultimaRevision.current) return
    setMesasPrevias(mesas)
    setPaso({ paso: 'declarando' })
  }

  function cancelar() {
    ultimaRevision.current++
    setValores({})
    setObservaciones('')
    setIntentado(false)
    setPaso({ paso: 'cerrado' })
  }

  function continuar() {
    setIntentado(true)
    const leido = leerCierre(turno.cajas, valores, observaciones)
    if (leido.ok) {
      setPaso({ paso: 'confirmando', body: leido.body, enviando: false, error: null })
      return
    }
    setFoco(primerCampoConError(turno.cajas, leido.errores))
  }

  async function cerrar(confirmacion: Confirmacion) {
    setPaso({ ...confirmacion, enviando: true, error: null })
    try {
      // El mapeo va en el mismo try: una respuesta 200 que no se puede leer cae en el camino ambiguo, no en un 4xx.
      const resultado = resultadoDesdeElCierre(await api.turnos.cerrar(turno.id, confirmacion.body))
      refrescarCajas()
      onCerrado(resultado)
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        // El turno ya estaba cerrado (otro lo cerró, o un intento anterior sí llegó): la pantalla lo vuelve a leer.
        if (e.status === 409 && e.message === MENSAJE_TURNO_CERRADO) {
          onTurnoCambio(e.message)
          return
        }
        // Cualquier otro 4xx (el 409 de operación simultánea, los 400) no cerró nada: reintentar es seguro.
        setPaso({ ...confirmacion, enviando: false, error: e.message || 'No se pudo cerrar el turno' })
        return
      }
      await resolverAmbiguo(confirmacion)
    }
  }

  /** El cobro no espera al polling para dejar de ofrecer las cajas que se cerraron. */
  function refrescarCajas() {
    void useCajasStore.getState().cargar(restauranteId)
  }

  /**
   * Un 5xx, un error de red o una respuesta 200 ilegible: el cierre pudo haberse hecho (los avisos se leen después del
   * commit). No se reintenta: se relee el turno actual. Si sigue el mismo abierto, no se cerró; si no, se arma el
   * resultado desde el detalle del turno, ya cerrado.
   */
  async function resolverAmbiguo(confirmacion: Confirmacion) {
    const quedarse = (error: string) => setPaso({ ...confirmacion, enviando: false, error })
    let abierto: TurnoDeCaja | null
    try {
      abierto = (await api.turnos.actual(restauranteId)).turno
    } catch {
      quedarse('No se pudo confirmar si el turno se cerró. Tocá «Actualizar» para ver su estado.')
      return
    }
    if (abierto?.id === turno.id) {
      quedarse('No se pudo cerrar el turno; sigue abierto. Probá de nuevo.')
      return
    }

    refrescarCajas()
    let resultado: ResultadoDelCierre
    try {
      resultado = resultadoDesdeElDetalle(await api.turnos.detalle(turno.id))
    } catch {
      onTurnoCambio('El turno se cerró, pero no se pudo leer el resultado del arqueo.')
      return
    }
    onCerrado(resultado)
  }

  const errores = intentado ? erroresDe(leerCierre(turno.cajas, valores, observaciones)) : {}

  return (
    <section aria-labelledby={`${id}-titulo`} style={estiloSeccion}>
      <h2 id={`${id}-titulo`} style={estiloTitulo}>Cerrar turno</h2>

      {paso.paso === 'cerrado' && (
        <div>
          <button type="button" onClick={() => void revisar()} style={estiloBoton(true)}>Cerrar turno</button>
        </div>
      )}

      {paso.paso === 'revisando' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <p role="status" style={{ ...estiloTexto, color: C.textMut }}>Revisando las mesas abiertas…</p>
          <button type="button" onClick={cancelar} style={estiloBoton(false)}>Cancelar</button>
        </div>
      )}

      {paso.paso === 'declarando' && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); continuar() }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AvisoDeMesasPrevias mesas={mesasPrevias} />
          <p style={{ ...estiloTexto, color: C.textMut }}>
            Contá lo que hay en cada caja y cargalo sin mirar el sistema. Escribí 0 en los métodos sin movimiento.
          </p>
          {turno.cajas.map((caja) => (
            <fieldset key={caja.cajaId} style={estiloCaja}>
              <legend style={{ ...estiloTitulo, fontSize: 13, padding: '0 6px' }}>{caja.nombre}</legend>
              {METODOS_DE_ARQUEO.map(({ metodo, etiqueta }) => (
                <CampoDeMonto
                  key={metodo}
                  id={idDelCampo(id, caja.cajaId, metodo)}
                  etiqueta={etiqueta}
                  valor={valores[caja.cajaId]?.[metodo] ?? ''}
                  error={errores[caja.cajaId]?.[metodo] ?? null}
                  onChange={(texto) => setValores((prev) => ({ ...prev, [caja.cajaId]: { ...prev[caja.cajaId], [metodo]: texto } }))}
                />
              ))}
            </fieldset>
          ))}
          <div>
            <label htmlFor={`${id}-observaciones`} style={{ ...estiloEtiqueta, display: 'block', marginBottom: 4 }}>
              Observaciones del cierre (opcional)
            </label>
            <textarea
              id={`${id}-observaciones`}
              value={observaciones}
              maxLength={MAXIMO_DE_OBSERVACIONES}
              rows={3}
              onChange={(e) => setObservaciones(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
                fontFamily: 'Inter,sans-serif', fontSize: 13, resize: 'vertical',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={estiloBoton(true)}>Continuar</button>
            <button type="button" onClick={cancelar} style={estiloBoton(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {paso.paso === 'confirmando' && (
        <ConfirmacionDelCierre
          turno={turno}
          confirmacion={paso}
          onCerrar={() => void cerrar(paso)}
          onVolver={() => setPaso({ paso: 'declarando' })}
        />
      )}
    </section>
  )
}

/** Los errores de la última lectura, o ninguno si se pudo leer. */
const erroresDe = (leido: ReturnType<typeof leerCierre>): PorCajaYMetodo => (leido.ok ? {} : leido.errores)

function AvisoDeMesasPrevias({ mesas }: { mesas: MesaAbiertaPrevia[] | null }) {
  if (mesas === null) {
    return <p role="status" style={estiloAviso}>No se pudo revisar si hay mesas abiertas. Podés cerrar igual.</p>
  }
  if (mesas.length === 0) return null
  return (
    <div role="status" style={estiloAviso}>
      <p style={estiloTexto}>
        {mesas.length === 1 ? 'Hay 1 mesa abierta.' : `Hay ${mesas.length} mesas abiertas.`} Podés cerrar igual, pero sin un turno
        abierto no se van a poder cobrar hasta que se abra uno nuevo.
      </p>
      <ul aria-label="Mesas abiertas" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {mesas.map((m) => <li key={m.mesaId} style={estiloTexto}>{textoDeMesaAbiertaPrevia(m)}</li>)}
      </ul>
    </div>
  )
}

function CampoDeMonto({ id, etiqueta, valor, error, onChange }: {
  id: string
  etiqueta: string
  valor: string
  error: string | null
  onChange: (valor: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} style={{ ...estiloEtiqueta, display: 'block', marginBottom: 4 }}>{etiqueta}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${id}-error`}
        style={{
          width: 180, padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
          border: `1px solid ${error === null ? C.border : C.red}`, fontFamily: 'Inter,sans-serif', fontSize: 13,
        }}
      />
      {error !== null && <p id={`${id}-error`} role="alert" style={estiloError}>{error}</p>}
    </div>
  )
}

function ConfirmacionDelCierre({ turno, confirmacion, onCerrar, onVolver }: {
  turno: TurnoDeCaja
  confirmacion: Confirmacion
  onCerrar: () => void
  onVolver: () => void
}) {
  const { body, enviando, error } = confirmacion
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 ref={enfocarAlMontar} tabIndex={-1} style={{ ...estiloTitulo, fontSize: 13, outline: 'none' }}>Confirmá el cierre</h3>
      {/* El body sale de leerCierre en el orden de turno.cajas: cada entrada es la caja de la misma posición. */}
      {turno.cajas.map((caja, i) => (
        <div key={caja.cajaId} style={estiloCaja}>
          <table style={{ borderCollapse: 'collapse' }}>
            <caption style={{ ...estiloEtiqueta, textAlign: 'left', marginBottom: 4 }}>Lo declarado en {caja.nombre}</caption>
            <tbody>
              {METODOS_DE_ARQUEO.map(({ metodo, etiqueta }) => (
                <tr key={metodo}>
                  <th scope="row" style={estiloCelda(true)}>{etiqueta}</th>
                  <td style={estiloCelda(false)}>{formatearMonto(body.cajas[i].declarado[metodo])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {body.observaciones && <p style={estiloTexto}>Observaciones: {body.observaciones}</p>}
      <p style={{ ...estiloTexto, fontWeight: 600 }}>Vas a cerrar el turno y todas sus cajas. No se puede deshacer.</p>
      {error && <p role="alert" style={{ ...estiloTexto, color: C.red }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCerrar} disabled={enviando} style={estiloBoton(true, enviando)}>
          {enviando ? 'Cerrando…' : 'Cerrar turno'}
        </button>
        <button type="button" onClick={onVolver} disabled={enviando} style={estiloBoton(false, enviando)}>
          Volver a corregir
        </button>
      </div>
    </div>
  )
}

const estiloSeccion = {
  background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
  display: 'flex', flexDirection: 'column', gap: 14,
} as const
const estiloTitulo = { fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy, margin: 0 } as const
const estiloTexto = { fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, margin: 0 } as const
const estiloEtiqueta = { fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: C.navy, margin: 0 } as const
const estiloError = { fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.red, margin: '4px 0 0' } as const
const estiloAviso = {
  margin: 0, background: C.orangeBg, border: `1px solid ${C.orange}`, borderRadius: 10, padding: '10px 14px',
  fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy,
} as const
const estiloCaja = {
  border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', margin: 0, background: C.white,
  display: 'flex', flexDirection: 'column', gap: 10,
} as const
const estiloCelda = (encabezado: boolean) => ({
  textAlign: 'left' as const, padding: '4px 12px 4px 0', fontFamily: 'Inter,sans-serif', fontSize: 13,
  fontWeight: encabezado ? 600 : 400, color: C.navy,
})
const estiloBoton = (principal: boolean, deshabilitado = false) => ({
  padding: '8px 16px', borderRadius: 8, fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
  border: principal ? 'none' : `1px solid ${C.border}`,
  background: principal ? C.orange : C.white,
  color: principal ? C.white : C.navy,
  cursor: deshabilitado ? 'not-allowed' : 'pointer',
  opacity: deshabilitado ? 0.6 : 1,
})
