import { useId, useState, type FormEvent } from 'react'
import type { InformacionLocal } from '@menyu/types'
import type { GuardarInformacionLocalInput } from '../../../services/api'
import { mensajeDeLaApi } from '../../../utils/mensajeDeError'
import { botonPrimario, conEstado, tarjeta, textoAyuda, tituloSeccion } from '../marca/estilos'
import { areaDeTexto, campo, contador, etiquetaCampo, mensajeDeExito, mensajeDeFalla } from './estilos'
import {
  LIMITES_INFORMACION,
  SERVICIOS,
  formularioDesdeInformacion,
  informacionParaGuardar,
  mismaInformacion,
  type ClaveServicio,
  type FormularioInformacion,
} from './informacionLocal'
import { ServicioTriestado } from './ServicioTriestado'

interface Props {
  /** Lo guardado al abrir la pantalla. Después de guardar, el formulario sigue con lo que devolvió la API. */
  informacion: InformacionLocal
  onGuardar:   (datos: GuardarInformacionLocalInput) => Promise<InformacionLocal>
}

/** Horarios, formas de pago y servicios del local: lo que responde el asistente cuando le preguntan por el lugar. */
export function InformacionLocalForm({ informacion, onGuardar }: Props) {
  const id = useId()
  const [guardada, setGuardada] = useState(() => formularioDesdeInformacion(informacion))
  const [valor, setValor] = useState(guardada)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const hayCambios = !mismaInformacion(valor, guardada)
  const puedeGuardar = hayCambios && !guardando

  function cambiar(cambios: Partial<FormularioInformacion>) {
    setValor((actual) => ({ ...actual, ...cambios }))
    setAviso(null)
    setError(null)
  }

  function cambiarServicio(clave: ClaveServicio, nuevo: boolean | null) {
    cambiar({ servicios: { ...valor.servicios, [clave]: nuevo } })
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await onGuardar(informacionParaGuardar(valor))
      const nueva = formularioDesdeInformacion(respuesta)
      setGuardada(nueva)
      setValor(nueva)
      setAviso('Información guardada')
    } catch (err) {
      setError(mensajeDeLaApi(err, 'No se pudo guardar la información. Probá de nuevo en un rato.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section aria-labelledby={`${id}-titulo`} style={tarjeta}>
      <h3 id={`${id}-titulo`} style={tituloSeccion}>Información del local</h3>
      <p style={{ ...textoAyuda, margin: '6px 0 20px', lineHeight: 1.5 }}>
        Lo que responde el asistente cuando le preguntan por el lugar. Lo que dejes vacío, dice que no lo sabe.
      </p>

      <form onSubmit={guardar} noValidate className="space-y-5">
        <div>
          <label htmlFor={`${id}-horarios`} style={etiquetaCampo}>Horarios</label>
          <textarea
            id={`${id}-horarios`}
            value={valor.horarios}
            maxLength={LIMITES_INFORMACION.horarios}
            rows={3}
            placeholder="Ej: martes a domingo de 12 a 16 y de 20 a 24; lunes cerrado"
            onChange={(e) => cambiar({ horarios: e.target.value })}
            style={areaDeTexto}
          />
          <p style={contador}>{valor.horarios.length}/{LIMITES_INFORMACION.horarios}</p>
        </div>

        <div>
          <label htmlFor={`${id}-pagos`} style={etiquetaCampo}>Formas de pago</label>
          <input
            id={`${id}-pagos`}
            type="text"
            value={valor.formasPago}
            maxLength={LIMITES_INFORMACION.formasPago}
            placeholder="Ej: efectivo, débito, crédito y Mercado Pago"
            onChange={(e) => cambiar({ formasPago: e.target.value })}
            style={campo}
          />
        </div>

        <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }} aria-describedby={`${id}-servicios`}>
          <legend style={{ ...etiquetaCampo, padding: 0 }}>Servicios</legend>
          <p id={`${id}-servicios`} style={{ ...textoAyuda, margin: '0 0 8px', lineHeight: 1.5 }}>
            Con Sí o No, el asistente responde lo que declares. Con Sin dato, responde que no tiene esa información y
            sugiere consultar al mozo.
          </p>
          {SERVICIOS.map((servicio) => (
            <ServicioTriestado
              key={servicio.clave}
              nombre={`${id}-${servicio.clave}`}
              etiqueta={servicio.texto}
              valor={valor.servicios[servicio.clave]}
              onChange={(nuevo) => cambiarServicio(servicio.clave, nuevo)}
              disabled={guardando}
            />
          ))}
        </fieldset>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div style={{ minHeight: 18 }}>
            {error ? (
              <p role="alert" style={mensajeDeFalla}>{error}</p>
            ) : aviso ? (
              <p role="status" style={mensajeDeExito}>{aviso}</p>
            ) : hayCambios ? (
              <p style={textoAyuda}>Tenés cambios sin guardar.</p>
            ) : null}
          </div>
          <button type="submit" disabled={!puedeGuardar} style={conEstado(botonPrimario, !puedeGuardar)}>
            {guardando ? 'Guardando…' : 'Guardar información'}
          </button>
        </div>
      </form>
    </section>
  )
}
