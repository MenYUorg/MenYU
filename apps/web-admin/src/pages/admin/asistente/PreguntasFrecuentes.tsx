import { useId, useState, type FormEvent } from 'react'
import type { PreguntaFrecuente } from '@menyu/types'
import type { PreguntaFrecuenteInput } from '../../../services/api'
import { mensajeDeLaApi } from '../../../utils/mensajeDeError'
import {
  C,
  botonPeligro,
  botonPrimario,
  botonSecundario,
  conEstado,
  tarjeta,
  textoAyuda,
  tituloSeccion,
} from '../marca/estilos'
import { areaDeTexto, campo, contador, etiquetaCampo, mensajeDeExito, mensajeDeFalla } from './estilos'
import { LIMITES_PREGUNTA } from './informacionLocal'

interface Props {
  /** Por fecha de creación, como las devuelve la API. */
  preguntas: PreguntaFrecuente[]
  onCrear:   (datos: PreguntaFrecuenteInput) => Promise<void>
  onEditar:  (id: string, datos: PreguntaFrecuenteInput) => Promise<void>
  onBorrar:  (id: string) => Promise<void>
}

/* ── alta y edición ─────────────────────────────────────────────────────────── */
interface FormularioProps {
  /** Para editar: la pregunta como está guardada. Sin esto, es el alta y se vacía al agregar. */
  inicial?:    PreguntaFrecuenteInput
  textoBoton:  string
  onEnviar:    (datos: PreguntaFrecuenteInput) => Promise<void>
  onCancelar?: () => void
}

function FormularioPregunta({ inicial, textoBoton, onEnviar, onCancelar }: FormularioProps) {
  const id = useId()
  const [pregunta, setPregunta] = useState(inicial?.pregunta ?? '')
  const [respuesta, setRespuesta] = useState(inicial?.respuesta ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const datos = { pregunta: pregunta.trim(), respuesta: respuesta.trim() }
  const completa = datos.pregunta.length > 0 && datos.respuesta.length > 0
  const cambio = !inicial || datos.pregunta !== inicial.pregunta || datos.respuesta !== inicial.respuesta
  const puedeEnviar = completa && cambio && !enviando

  function alEscribir() {
    setError(null)
    setAviso(null)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!puedeEnviar) return
    setEnviando(true)
    setError(null)
    try {
      await onEnviar(datos)
      if (!inicial) {
        setPregunta('')
        setRespuesta('')
        setAviso('Pregunta agregada')
      }
    } catch (err) {
      setError(mensajeDeLaApi(err, 'No se pudo guardar la pregunta. Probá de nuevo en un rato.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <div>
        <label htmlFor={`${id}-pregunta`} style={etiquetaCampo}>Pregunta</label>
        <input
          id={`${id}-pregunta`}
          type="text"
          value={pregunta}
          maxLength={LIMITES_PREGUNTA.pregunta}
          placeholder="Ej: ¿Hacen reservas?"
          onChange={(e) => { setPregunta(e.target.value); alEscribir() }}
          style={campo}
        />
      </div>
      <div>
        <label htmlFor={`${id}-respuesta`} style={etiquetaCampo}>Respuesta</label>
        <textarea
          id={`${id}-respuesta`}
          value={respuesta}
          maxLength={LIMITES_PREGUNTA.respuesta}
          rows={3}
          placeholder="Ej: Sí, por teléfono o por WhatsApp, hasta las 18 del mismo día."
          onChange={(e) => { setRespuesta(e.target.value); alEscribir() }}
          style={areaDeTexto}
        />
        <p style={contador}>{respuesta.length}/{LIMITES_PREGUNTA.respuesta}</p>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div style={{ minHeight: 18 }}>
          {error ? (
            <p role="alert" style={mensajeDeFalla}>{error}</p>
          ) : aviso ? (
            <p role="status" style={mensajeDeExito}>{aviso}</p>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {onCancelar && (
            <button type="button" onClick={onCancelar} disabled={enviando} style={conEstado(botonSecundario, enviando)}>
              Cancelar
            </button>
          )}
          <button type="submit" disabled={!puedeEnviar} style={conEstado(botonPrimario, !puedeEnviar)}>
            {enviando ? 'Guardando…' : textoBoton}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ── una pregunta de la lista ───────────────────────────────────────────────── */
function FilaPregunta({
  pregunta,
  onEditar,
  onBorrar,
}: {
  pregunta: PreguntaFrecuente
  onEditar: (datos: PreguntaFrecuenteInput) => Promise<void>
  onBorrar: () => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function borrar() {
    if (!window.confirm(`¿Borrar la pregunta «${pregunta.pregunta}»? El asistente deja de usarla.`)) return
    setBorrando(true)
    setError(null)
    try {
      await onBorrar()
    } catch (err) {
      setError(mensajeDeLaApi(err, 'No se pudo borrar la pregunta. Probá de nuevo en un rato.'))
      setBorrando(false)
    }
  }

  return (
    <li style={{ padding: '16px 0', borderTop: `1px solid ${C.border}` }}>
      {editando ? (
        <FormularioPregunta
          inicial={{ pregunta: pregunta.pregunta, respuesta: pregunta.respuesta }}
          textoBoton="Guardar cambios"
          onEnviar={async (datos) => {
            await onEditar(datos)
            setEditando(false)
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>
              {pregunta.pregunta}
            </p>
            <p style={{ ...textoAyuda, fontSize: 14, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {pregunta.respuesta}
            </p>
            {error && <p role="alert" style={{ ...mensajeDeFalla, marginTop: 8 }}>{error}</p>}
          </div>
          <div className="flex gap-2" style={{ flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => { setError(null); setEditando(true) }}
              disabled={borrando}
              aria-label={`Editar «${pregunta.pregunta}»`}
              style={conEstado(botonSecundario, borrando)}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => { void borrar() }}
              disabled={borrando}
              aria-label={`Borrar «${pregunta.pregunta}»`}
              style={conEstado(botonPeligro, borrando)}
            >
              {borrando ? 'Borrando…' : 'Borrar'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

/* ── la tarjeta ─────────────────────────────────────────────────────────────── */
/** Las preguntas que el dueño responde una vez y el asistente usa tal cual. */
export function PreguntasFrecuentes({ preguntas, onCrear, onEditar, onBorrar }: Props) {
  const id = useId()

  return (
    <section aria-labelledby={`${id}-titulo`} style={tarjeta}>
      <h3 id={`${id}-titulo`} style={tituloSeccion}>Preguntas frecuentes</h3>
      <p style={{ ...textoAyuda, margin: '6px 0 4px', lineHeight: 1.5 }}>
        Las que te hacen seguido los clientes, con tu respuesta. El asistente las usa tal cual las escribas.
      </p>

      {preguntas.length === 0 ? (
        <p style={{ ...textoAyuda, fontSize: 14, padding: '16px 0', lineHeight: 1.5 }}>
          Todavía no cargaste preguntas frecuentes. Empezá por las que más se repiten: si toman reservas, si hacen
          delivery o si se puede festejar un cumpleaños.
        </p>
      ) : (
        <ul aria-label="Preguntas cargadas" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
          {preguntas.map((p) => (
            <FilaPregunta
              key={p.id}
              pregunta={p}
              onEditar={(datos) => onEditar(p.id, datos)}
              onBorrar={() => onBorrar(p.id)}
            />
          ))}
        </ul>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
        <h4 style={{ ...tituloSeccion, fontSize: 14, marginBottom: 12 }}>Nueva pregunta</h4>
        <FormularioPregunta textoBoton="Agregar pregunta" onEnviar={onCrear} />
      </div>
    </section>
  )
}
