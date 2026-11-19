import { useId, useState } from 'react'
import type { RegistrarMovimientoBody, TipoDeMovimiento, TurnoCajaApi } from '@menyu/types'
import { api, ApiError } from '../services/api'
import { MENSAJE_TURNO_CERRADO } from '../utils/conflictosDeCaja'
import { formatearMonto } from '../utils/formato'
import { MOTIVO_MAXIMO, parsearMontoDeMovimiento, parsearMotivo } from '../utils/movimiento'

/** El POST no respondió: no se sabe si el movimiento quedó registrado, así que no se reintenta solo. */
export const MENSAJE_SIN_RESPUESTA = 'No se pudo confirmar si el movimiento se registró. Revisá la lista antes de volver a intentar.'

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

const TIPOS: { tipo: TipoDeMovimiento; nombre: string }[] = [
  { tipo: 'INGRESO', nombre: 'Ingreso' },
  { tipo: 'EGRESO', nombre: 'Egreso' },
]

interface Campos {
  cajaId: string | null
  tipo: TipoDeMovimiento | null
  monto: string
  motivo: string
}

const VACIOS: Campos = { cajaId: null, tipo: null, monto: '', motivo: '' }

type Paso =
  | { paso: 'formulario' }
  | { paso: 'confirmando'; body: RegistrarMovimientoBody; cajaNombre: string; enviando: boolean }

type Errores = Record<keyof Campos, string | null>

interface FormularioDeMovimientoProps {
  turnoId: string
  /** Las cajas del turno: con una sola no se elige. */
  cajas: TurnoCajaApi[]
  /** La lista tiene que volver a leerse (se registró un movimiento, o no se sabe si se registró). */
  onReleer: () => void
  onTurnoCambio: (mensaje: string) => void
}

/** Lleva el foco a un elemento cuando se monta. Es estable: React no la vuelve a llamar en cada render. */
const enfocarAlMontar = (el: HTMLElement | null) => el?.focus()

/** La caja elegida: con una sola caja en el turno es esa, sin elegir. */
function cajaDe(cajas: TurnoCajaApi[], cajaId: string | null) {
  return cajas.length === 1 ? cajas[0] : cajas.find((c) => c.cajaId === cajaId)
}

/** Los errores de cada campo: después del primer intento; los de formato del monto, enseguida. */
function erroresDe(campos: Campos, cajas: TurnoCajaApi[], intentado: boolean): Errores {
  const monto = parsearMontoDeMovimiento(campos.monto)
  const motivo = parsearMotivo(campos.motivo)
  const montoEnBlanco = campos.monto.trim() === ''
  return {
    cajaId: intentado && !cajaDe(cajas, campos.cajaId) ? 'Elegí la caja' : null,
    tipo: intentado && campos.tipo === null ? 'Elegí si es un ingreso o un egreso' : null,
    monto: monto.ok || (!intentado && montoEnBlanco) ? null : monto.mensaje,
    motivo: intentado && !motivo.ok ? motivo.mensaje : null,
  }
}

/** El body a mandar y el nombre de la caja, o null si falta algo o algo es inválido. */
function movimientoDe(campos: Campos, cajas: TurnoCajaApi[]) {
  const caja = cajaDe(cajas, campos.cajaId)
  const monto = parsearMontoDeMovimiento(campos.monto)
  const motivo = parsearMotivo(campos.motivo)
  if (!caja || campos.tipo === null || !monto.ok || !motivo.ok) return null
  const body: RegistrarMovimientoBody = { cajaId: caja.cajaId, tipo: campos.tipo, monto: monto.valor, motivo: motivo.valor }
  return { body, cajaNombre: caja.nombre }
}

/**
 * Registrar un ingreso o un egreso en una caja del turno (#359). Con todo válido pasa a una confirmación en el mismo
 * lugar: los movimientos no se editan ni se borran. Un 409 de turno cerrado se lo pasa a la pantalla; cualquier otro
 * error del servidor vuelve al formulario con lo escrito; sin respuesta, avisa y pide releer la lista, sin reintentar.
 */
export function FormularioDeMovimiento({ turnoId, cajas, onReleer, onTurnoCambio }: FormularioDeMovimientoProps) {
  const [campos, setCampos] = useState<Campos>(VACIOS)
  const [intentado, setIntentado] = useState(false)
  const [paso, setPaso] = useState<Paso>({ paso: 'formulario' })
  const [error, setError] = useState<string | null>(null)
  const [registrado, setRegistrado] = useState(false)
  const [volvio, setVolvio] = useState(false)

  function revisar() {
    setIntentado(true)
    setError(null)
    setRegistrado(false)
    setVolvio(false)
    const movimiento = movimientoDe(campos, cajas)
    if (movimiento) setPaso({ paso: 'confirmando', ...movimiento, enviando: false })
  }

  function volverAlFormulario(mensaje: string) {
    setError(mensaje)
    setPaso({ paso: 'formulario' })
  }

  async function confirmar(confirmacion: Extract<Paso, { paso: 'confirmando' }>) {
    setPaso({ ...confirmacion, enviando: true })
    try {
      await api.turnos.registrarMovimiento(turnoId, confirmacion.body)
      setCampos(VACIOS)
      setIntentado(false)
      setRegistrado(true)
      setPaso({ paso: 'formulario' })
      onReleer()
    } catch (e) {
      if (!(e instanceof ApiError)) {
        volverAlFormulario(MENSAJE_SIN_RESPUESTA)
        onReleer()
        return
      }
      if (e.status === 409 && e.message === MENSAJE_TURNO_CERRADO) {
        onTurnoCambio(e.message)
        return
      }
      volverAlFormulario(e.message || 'No se pudo registrar el movimiento')
    }
  }

  if (paso.paso === 'confirmando') {
    return (
      <Confirmacion
        confirmacion={paso}
        onConfirmar={() => void confirmar(paso)}
        onVolver={() => { setVolvio(true); setPaso({ paso: 'formulario' }) }}
      />
    )
  }

  return (
    <Formulario
      cajas={cajas}
      campos={campos}
      errores={erroresDe(campos, cajas, intentado)}
      error={error}
      registrado={registrado}
      enfocarMonto={volvio}
      onChange={(cambio) => setCampos((prev) => ({ ...prev, ...cambio }))}
      onRevisar={revisar}
    />
  )
}

function Confirmacion({ confirmacion, onConfirmar, onVolver }: {
  confirmacion: Extract<Paso, { paso: 'confirmando' }>
  onConfirmar: () => void
  onVolver: () => void
}) {
  const { body, cajaNombre, enviando } = confirmacion
  const tipo = body.tipo === 'INGRESO' ? 'ingreso' : 'egreso'
  return (
    <div style={{ ...estiloCaja, background: C.orangeBg, borderColor: C.orange }}>
      <p ref={enfocarAlMontar} tabIndex={-1} style={{ ...estiloTexto, outline: 'none' }}>
        Vas a registrar un {tipo} de {formatearMonto(body.monto)} en {cajaNombre}: «{body.motivo}». No se puede editar ni
        borrar.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onConfirmar} disabled={enviando} style={estiloBoton(true, enviando)}>
          {enviando ? 'Registrando…' : 'Confirmar'}
        </button>
        <button type="button" onClick={onVolver} disabled={enviando} style={estiloBoton(false, enviando)}>
          Volver
        </button>
      </div>
    </div>
  )
}

function Formulario({ cajas, campos, errores, error, registrado, enfocarMonto, onChange, onRevisar }: {
  cajas: TurnoCajaApi[]
  campos: Campos
  errores: Errores
  error: string | null
  registrado: boolean
  enfocarMonto: boolean
  onChange: (cambio: Partial<Campos>) => void
  onRevisar: () => void
}) {
  const id = useId()
  const unaSola = cajas.length === 1
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); onRevisar() }}>
      <fieldset style={estiloCaja}>
        <legend style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 13, color: C.navy, padding: '0 6px' }}>
          Registrar movimiento
        </legend>
        <p style={{ ...estiloTexto, fontSize: 12, color: C.textMut }}>
          Los movimientos no se pueden editar ni borrar. Si te equivocás, cargá uno del tipo contrario con el motivo.
        </p>

        {unaSola ? (
          <p style={estiloTexto}>Caja: {cajas[0].nombre}</p>
        ) : (
          <GrupoDeRadios
            id={`${id}-caja`}
            titulo="Caja"
            opciones={cajas.map((c) => ({ valor: c.cajaId, nombre: c.nombre }))}
            elegida={campos.cajaId}
            error={errores.cajaId}
            onElegir={(cajaId) => onChange({ cajaId })}
          />
        )}

        <GrupoDeRadios
          id={`${id}-tipo`}
          titulo="Tipo"
          opciones={TIPOS.map((t) => ({ valor: t.tipo, nombre: t.nombre }))}
          elegida={campos.tipo}
          error={errores.tipo}
          onElegir={(tipo) => onChange({ tipo })}
        />

        <CampoDeTexto
          id={`${id}-monto`}
          etiqueta="Monto"
          valor={campos.monto}
          error={errores.monto}
          inputMode="decimal"
          enfocar={enfocarMonto}
          onChange={(monto) => onChange({ monto })}
        />

        <CampoDeTexto
          id={`${id}-motivo`}
          etiqueta="Motivo"
          valor={campos.motivo}
          error={errores.motivo}
          maxLength={MOTIVO_MAXIMO}
          onChange={(motivo) => onChange({ motivo })}
        />

        {error && <p role="alert" ref={enfocarAlMontar} tabIndex={-1} style={{ ...estiloTexto, color: C.red, outline: 'none' }}>{error}</p>}
        {registrado && (
          <p role="status" ref={enfocarAlMontar} tabIndex={-1} style={{ ...estiloTexto, color: C.green, fontWeight: 600, outline: 'none' }}>
            Movimiento registrado
          </p>
        )}

        <div>
          <button type="submit" style={estiloBoton(true)}>Registrar movimiento</button>
        </div>
      </fieldset>
    </form>
  )
}

function GrupoDeRadios<T extends string>({ id, titulo, opciones, elegida, error, onElegir }: {
  id: string
  titulo: string
  opciones: { valor: T; nombre: string }[]
  elegida: T | null
  error: string | null
  onElegir: (valor: T) => void
}) {
  return (
    <div>
      <p id={`${id}-titulo`} style={{ ...estiloEtiqueta, marginBottom: 6 }}>{titulo}</p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-titulo`}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${id}-error`}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        {opciones.map((o) => {
          const marcada = elegida === o.valor
          return (
            <label
              key={o.valor}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${marcada ? C.orange : C.border}`, background: marcada ? C.orangeBg : C.white,
                fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, fontWeight: marcada ? 600 : 400,
              }}
            >
              <input
                type="radio"
                name={id}
                value={o.valor}
                checked={marcada}
                onChange={() => onElegir(o.valor)}
                style={{ accentColor: C.orange, margin: 0 }}
              />
              {o.nombre}
            </label>
          )
        })}
      </div>
      {error !== null && <p id={`${id}-error`} role="alert" style={estiloError}>{error}</p>}
    </div>
  )
}

function CampoDeTexto({ id, etiqueta, valor, error, inputMode, maxLength, enfocar = false, onChange }: {
  id: string
  etiqueta: string
  valor: string
  error: string | null
  inputMode?: 'decimal'
  maxLength?: number
  enfocar?: boolean
  onChange: (valor: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} style={{ ...estiloEtiqueta, display: 'block', marginBottom: 4 }}>{etiqueta}</label>
      <input
        id={id}
        ref={enfocar ? enfocarAlMontar : undefined}
        type="text"
        inputMode={inputMode}
        maxLength={maxLength}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : `${id}-error`}
        style={{
          width: '100%', maxWidth: 360, padding: '8px 10px', borderRadius: 8, boxSizing: 'border-box',
          border: `1px solid ${error === null ? C.border : C.red}`, fontFamily: 'Inter,sans-serif', fontSize: 13,
        }}
      />
      {error !== null && <p id={`${id}-error`} role="alert" style={estiloError}>{error}</p>}
    </div>
  )
}

const estiloTexto = { fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.navy, margin: 0 } as const
const estiloEtiqueta = { fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 600, color: C.navy, margin: 0 } as const
const estiloError = { fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.red, margin: '4px 0 0' } as const
const estiloCaja = {
  border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', margin: 0, background: C.white,
  display: 'flex', flexDirection: 'column', gap: 12,
} as const

const estiloBoton = (principal: boolean, deshabilitado = false) => ({
  padding: '8px 16px', borderRadius: 8, fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600,
  border: principal ? 'none' : `1px solid ${C.border}`,
  background: principal ? C.orange : C.white,
  color: principal ? C.white : C.navy,
  cursor: deshabilitado ? 'not-allowed' : 'pointer',
  opacity: deshabilitado ? 0.6 : 1,
})
