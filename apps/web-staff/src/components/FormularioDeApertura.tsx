import { useCallback, useEffect, useId, useState } from 'react'
import type { CajaDelRestaurante, PreparacionDeTurno, TurnoDeCaja } from '@menyu/types'
import { api, ApiError } from '../services/api'
import { useCajasStore } from '../store/cajasStore'
import { AsignacionDeMesas } from './AsignacionDeMesas'
import { parsearFondo } from '../utils/fondo'
import { MAXIMO_DE_OBSERVACIONES } from '../utils/observaciones'
import { asignacionesAEnviar, asignacionesIniciales, type ValoresDeAsignacion } from '../utils/asignaciones'
import {
  estiloBotonPrimario, estiloBotonSecundario, estiloCampo, estiloCargandoPagina, estiloErrorBanda, estiloErrorDeCampo,
  estiloEtiqueta, estiloTarjeta,
} from './estilosDeCaja'

/**
 * Los 409 de POST /turnos que dicen que ya hay algo abierto: apps/backend/src/caja/conflictos.ts (MENSAJE_TURNO_ABIERTO
 * y MENSAJE_CAJA_YA_ABIERTA). Si cambian allá, cambian acá. Con cualquiera de los dos la pantalla vuelve a leer el turno.
 */
export const MENSAJE_TURNO_ABIERTO = 'Ya hay un turno abierto en este restaurante'
export const MENSAJE_CAJA_YA_ABIERTA = 'La caja ya está abierta'

const MAXIMO_DE_CAJAS = 2

const C = {
  orange:  '#E8563A',
  navy:    '#2D3561',
  white:   '#FFFFFF',
  border:  '#E6E8EF',
  textMut: '#6B7280',
  red:     '#dc2626',
} as const

type Lectura =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; cajas: CajaDelRestaurante[]; preparacion: PreparacionDeTurno }

interface FormularioDeAperturaProps {
  restauranteId: string
  /** El turno que devolvió POST /turnos. */
  onAbierto: (turno: TurnoDeCaja) => void
  /** Ya había un turno o una caja abierta: la pantalla vuelve a leer el turno actual y muestra `mensaje`. */
  onTurnoCambio: (mensaje: string) => void
}

const mensajeDe = (e: unknown, porDefecto: string) => (e instanceof Error && e.message ? e.message : porDefecto)

const estiloTitulo = { fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 14, color: C.navy, margin: 0 } as const

/**
 * Abrir el turno (#359): las cajas con su fondo inicial, las mesas por mozo y las observaciones. Necesita las dos
 * lecturas (GET /cajas y GET /turnos/preparacion); sin alguna no se puede abrir. Manda siempre la lista de asignaciones
 * que se ve, también vacía: la precarga del servidor es solo el valor inicial del editor.
 */
export function FormularioDeApertura({ restauranteId, onAbierto, onTurnoCambio }: FormularioDeAperturaProps) {
  const id = useId()
  const [lectura, setLectura] = useState<Lectura>({ estado: 'cargando' })
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [fondos, setFondos] = useState<Record<string, string>>({})
  const [valores, setValores] = useState<ValoresDeAsignacion>({})
  const [observaciones, setObservaciones] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLectura({ estado: 'cargando' })
    try {
      const [cajas, preparacion] = await Promise.all([
        api.cajas.todas(restauranteId),
        api.turnos.preparacion(restauranteId),
      ])
      setValores(asignacionesIniciales(preparacion.mesas, preparacion.mozos, preparacion.precarga.asignaciones))
      setLectura({ estado: 'listo', cajas: cajas.filter((c) => c.activa), preparacion })
    } catch (e) {
      setLectura({ estado: 'error', mensaje: mensajeDe(e, 'No se pudieron cargar las cajas y las mesas') })
    }
  }, [restauranteId])

  useEffect(() => { void cargar() }, [cargar])

  if (lectura.estado === 'cargando') {
    return <p role="status" style={estiloCargandoPagina}>Cargando las cajas y las mesas…</p>
  }

  if (lectura.estado === 'error') {
    return (
      <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
        <p style={estiloErrorBanda}>{lectura.mensaje}</p>
        <button type="button" onClick={() => void cargar()} style={estiloBotonSecundario()}>Reintentar</button>
      </div>
    )
  }

  const { cajas, preparacion } = lectura
  const sinCajas = cajas.length === 0
  const fondoDe = (cajaId: string) => parsearFondo(fondos[cajaId] ?? '')
  // Un fondo con un formato inválido avisa enseguida; el vacío, recién al intentar abrir.
  const errorDelFondo = (cajaId: string) => {
    const fondo = fondoDe(cajaId)
    if (fondo.ok || (!intentado && (fondos[cajaId] ?? '').trim() === '')) return null
    return fondo.mensaje
  }

  function alternar(cajaId: string) {
    setMarcadas((prev) => (prev.includes(cajaId) ? prev.filter((c) => c !== cajaId) : [...prev, cajaId]))
  }

  async function abrir() {
    setIntentado(true)
    setError(null)
    // En el orden de la lista (por nombre), no en el que se marcaron. El fondo en 0 también se manda.
    const cajasDelTurno: { cajaId: string; fondoInicial: number }[] = []
    for (const caja of cajas.filter((c) => marcadas.includes(c.id))) {
      const fondo = fondoDe(caja.id)
      if (!fondo.ok) return
      cajasDelTurno.push({ cajaId: caja.id, fondoInicial: fondo.valor })
    }
    if (cajasDelTurno.length === 0) return

    setEnviando(true)
    try {
      const texto = observaciones.trim()
      const { turno } = await api.turnos.abrir({
        restauranteId,
        cajas: cajasDelTurno,
        asignaciones: asignacionesAEnviar(valores),
        ...(texto ? { observaciones: texto } : {}),
      })
      // Pagos no espera al polling para enterarse de que hay cajas abiertas.
      void useCajasStore.getState().cargar(restauranteId)
      onAbierto(turno)
    } catch (e) {
      const mensaje = mensajeDe(e, 'No se pudo abrir el turno')
      if (e instanceof ApiError && e.status === 409 && (mensaje === MENSAJE_TURNO_ABIERTO || mensaje === MENSAJE_CAJA_YA_ABIERTA)) {
        onTurnoCambio(mensaje)
        return
      }
      setError(mensaje)
      setEnviando(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); void abrir() }}
      style={{ ...estiloTarjeta, display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      <h2 style={{ ...estiloTitulo, fontSize: 16 }}>Abrir turno</h2>

      <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', margin: 0, background: C.white }}>
        <legend style={{ ...estiloTitulo, padding: '0 6px' }}>Cajas del turno (hasta 2)</legend>
        {sinCajas ? (
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.textMut, margin: 0 }}>
            Todavía no hay cajas activas en este restaurante. Se crean desde el panel de administración.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cajas.map((caja) => {
              const marcada = marcadas.includes(caja.id)
              const idFondo = `${id}-fondo-${caja.id}`
              const errorFondo = marcada ? errorDelFondo(caja.id) : null
              return (
                <div key={caja.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy }}>
                    <input
                      type="checkbox"
                      style={{ width: 16, height: 16, accentColor: '#E8563A', cursor: 'pointer' }}
                      checked={marcada}
                      disabled={enviando || (!marcada && marcadas.length >= MAXIMO_DE_CAJAS)}
                      onChange={() => alternar(caja.id)}
                    />
                    {caja.nombre}
                  </label>
                  {marcada && (
                    <div style={{ paddingLeft: 24 }}>
                      <label htmlFor={idFondo} style={estiloEtiqueta}>
                        Fondo inicial de {caja.nombre}
                      </label>
                      <input
                        id={idFondo}
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={fondos[caja.id] ?? ''}
                        disabled={enviando}
                        onChange={(e) => setFondos((prev) => ({ ...prev, [caja.id]: e.target.value }))}
                        aria-invalid={errorFondo !== null}
                        aria-describedby={errorFondo === null ? undefined : `${idFondo}-error`}
                        style={estiloCampo(errorFondo !== null)}
                      />
                      {errorFondo !== null && <p id={`${idFondo}-error`} role="alert" style={estiloErrorDeCampo}>{errorFondo}</p>}
                    </div>
                  )}
                </div>
              )
            })}
            {intentado && marcadas.length === 0 && <p role="alert" style={estiloErrorDeCampo}>Elegí al menos una caja</p>}
          </div>
        )}
      </fieldset>

      <section aria-labelledby={`${id}-mesas`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 id={`${id}-mesas`} style={estiloTitulo}>Mesas por mozo</h3>
        <AsignacionDeMesas
          mesas={preparacion.mesas}
          mozos={preparacion.mozos}
          valores={valores}
          onChange={setValores}
          avisos={preparacion.precarga.avisos}
          deshabilitado={enviando}
        />
      </section>

      <div>
        <label htmlFor={`${id}-observaciones`} style={estiloEtiqueta}>
          Observaciones (opcional)
        </label>
        <textarea
          id={`${id}-observaciones`}
          value={observaciones}
          maxLength={MAXIMO_DE_OBSERVACIONES}
          disabled={enviando}
          rows={3}
          onChange={(e) => setObservaciones(e.target.value)}
          style={{ ...estiloCampo(false), maxWidth: 'none', resize: 'vertical' }}
        />
      </div>

      {error && <p role="alert" style={estiloErrorBanda}>{error}</p>}

      <div>
        <button
          type="submit"
          disabled={sinCajas || enviando}
          style={estiloBotonPrimario(sinCajas || enviando)}
        >
          {enviando ? 'Abriendo…' : 'Abrir turno'}
        </button>
      </div>
    </form>
  )
}
