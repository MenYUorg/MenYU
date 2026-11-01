import { useId, type CSSProperties } from 'react'
import type { EtiquetaDietaria } from '@menyu/types'
import {
  LIMITES_DATOS_ASISTENTE as LIMITES,
  OPCIONES_ETIQUETAS,
  OPCIONES_PICANTE,
  OPCIONES_TAMANIO,
  OPCIONES_TEMPERATURA,
  conTamanio,
  type FormularioDatosAsistente,
} from './datosAsistente'
import { chipSt, inputSt, labelSt } from './estilosFormulario'

interface Props {
  valor:    FormularioDatosAsistente
  onChange: (valor: FormularioDatosAsistente) => void
  /** Si el formulario muestra el catálogo "Dietas / Restricciones": entonces se aclara que son cosas distintas. */
  conFiltroDeDietas?: boolean
}

const ayudaSt: CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize:   12,
  color:      '#6b7280',
  margin:     0,
  lineHeight: 1.5,
}

/**
 * Los datos del plato que usa el asistente de la carta. Todos opcionales y con "Sin dato" para volver atrás: lo que
 * queda vacío se guarda como null y el asistente responde que no lo sabe.
 */
export function DatosAsistenteFields({ valor, onChange, conFiltroDeDietas = false }: Props) {
  const id = useId()
  const cambiar = (cambios: Partial<FormularioDatosAsistente>) => onChange({ ...valor, ...cambios })
  const alternarEtiqueta = (etiqueta: EtiquetaDietaria) =>
    cambiar({
      etiquetasDietarias: valor.etiquetasDietarias.includes(etiqueta)
        ? valor.etiquetasDietarias.filter((e) => e !== etiqueta)
        : [...valor.etiquetasDietarias, etiqueta],
    })
  const paraVariasPersonas = valor.tamanioPorcion === 'PARA_N_PERSONAS'

  return (
    <fieldset
      aria-describedby={`${id}-ayuda`}
      style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: 0, padding: '20px 0 0', minWidth: 0 }}
    >
      <legend
        style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 700,
          fontSize:   15,
          color:      '#2D3561',
          padding:    '0 8px 0 0',
        }}
      >
        Datos para el asistente
      </legend>
      <p id={`${id}-ayuda`} style={{ ...ayudaSt, margin: '4px 0 16px' }}>
        Opcionales. El asistente de la carta responde las preguntas de los clientes con estos datos; lo que quede sin
        dato, responde que no lo sabe y sugiere consultar al mozo.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-tamanio`} style={labelSt}>Tamaño de la porción</label>
          <select
            id={`${id}-tamanio`}
            value={valor.tamanioPorcion}
            onChange={(e) => onChange(conTamanio(valor, e.target.value as FormularioDatosAsistente['tamanioPorcion']))}
            style={inputSt}
          >
            <option value="">Sin dato</option>
            {OPCIONES_TAMANIO.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </div>

        {/* Solo cuenta con "Para N personas": con otro tamaño el campo no está y se guarda vacío. */}
        {paraVariasPersonas && (
          <div>
            <label htmlFor={`${id}-personas`} style={labelSt}>¿Para cuántas personas?</label>
            <input
              id={`${id}-personas`}
              type="number"
              inputMode="numeric"
              min={LIMITES.porcionPersonas.min}
              max={LIMITES.porcionPersonas.max}
              step={1}
              value={valor.porcionPersonas}
              onChange={(e) => cambiar({ porcionPersonas: e.target.value })}
              placeholder="Ej: 2"
              style={inputSt}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-detalle`} style={labelSt}>Detalle de la porción</label>
          <input
            id={`${id}-detalle`}
            value={valor.porcionDetalle}
            maxLength={LIMITES.porcionDetalle}
            onChange={(e) => cambiar({ porcionDetalle: e.target.value })}
            placeholder="Ej: 300 g, 3 unidades"
            style={inputSt}
          />
        </div>

        <div>
          <label htmlFor={`${id}-temperatura`} style={labelSt}>Temperatura</label>
          <select
            id={`${id}-temperatura`}
            value={valor.temperatura}
            onChange={(e) => cambiar({ temperatura: e.target.value as FormularioDatosAsistente['temperatura'] })}
            style={inputSt}
          >
            <option value="">Sin dato</option>
            {OPCIONES_TEMPERATURA.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-picante`} style={labelSt}>Nivel de picante</label>
          <select
            id={`${id}-picante`}
            value={valor.nivelPicante}
            onChange={(e) => cambiar({ nivelPicante: e.target.value as FormularioDatosAsistente['nivelPicante'] })}
            style={inputSt}
          >
            <option value="">Sin dato</option>
            {OPCIONES_PICANTE.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-acompanamiento`} style={labelSt}>Acompañamiento incluido</label>
          <input
            id={`${id}-acompanamiento`}
            value={valor.acompanamiento}
            maxLength={LIMITES.acompanamiento}
            onChange={(e) => cambiar({ acompanamiento: e.target.value })}
            placeholder="Ej: papas fritas"
            style={inputSt}
          />
        </div>

        <div>
          <label htmlFor={`${id}-tiempo`} style={labelSt}>Tiempo de preparación (minutos)</label>
          <input
            id={`${id}-tiempo`}
            type="number"
            inputMode="numeric"
            min={LIMITES.tiempoPreparacionMin.min}
            max={LIMITES.tiempoPreparacionMin.max}
            step={1}
            value={valor.tiempoPreparacionMin}
            onChange={(e) => cambiar({ tiempoPreparacionMin: e.target.value })}
            placeholder="Ej: 15"
            style={inputSt}
          />
        </div>

        <div className="sm:col-span-2" role="group" aria-labelledby={`${id}-etiquetas`}>
          <span id={`${id}-etiquetas`} style={labelSt}>Etiquetas dietarias</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {OPCIONES_ETIQUETAS.map((o) => {
              const elegida = valor.etiquetasDietarias.includes(o.valor)
              return (
                <button
                  key={o.valor}
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => alternarEtiqueta(o.valor)}
                  style={chipSt(elegida)}
                >
                  {o.texto}
                </button>
              )
            })}
          </div>
          <p style={{ ...ayudaSt, marginTop: 8 }}>
            Marcá solo lo que el local puede asegurar. Ante una consulta por celiaquía, el asistente repite lo que
            declares y sugiere confirmarlo con el mozo.
            {conFiltroDeDietas && ' Son aparte de «Dietas / Restricciones», que es el filtro de la carta.'}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${id}-info`} style={labelSt}>Información adicional</label>
          <textarea
            id={`${id}-info`}
            value={valor.infoAdicional}
            maxLength={LIMITES.infoAdicional}
            onChange={(e) => cambiar({ infoAdicional: e.target.value })}
            placeholder="Ej: se puede pedir sin cebolla"
            rows={3}
            style={{ ...inputSt, resize: 'vertical' }}
          />
          <p style={{ ...ayudaSt, textAlign: 'right', marginTop: 4 }}>
            {valor.infoAdicional.length}/{LIMITES.infoAdicional}
          </p>
        </div>
      </div>
    </fieldset>
  )
}
