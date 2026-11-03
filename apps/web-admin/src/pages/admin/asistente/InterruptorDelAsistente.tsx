import { useId, useState } from 'react'
import { mensajeDeLaApi } from '../../../utils/mensajeDeError'
import { ToggleSwitch } from '../menu/ToggleSwitch'
import { C, tarjeta, textoAyuda, tituloSeccion } from '../marca/estilos'
import { mensajeDeFalla } from './estilos'

interface Props {
  nombreRestaurante: string
  habilitado:        boolean
  /** Solo el dueño lo prende y lo apaga; el gerente ve el estado pero no lo puede cambiar (el backend también lo exige). */
  puedeCambiar:      boolean
  /** Guarda el interruptor; si falla, el interruptor queda como estaba. */
  onCambiar:         (habilitado: boolean) => Promise<void>
}

/** Prende o apaga el asistente en la carta del restaurante. Se guarda al tocarlo. */
export function InterruptorDelAsistente({ nombreRestaurante, habilitado, puedeCambiar, onCambiar }: Props) {
  const id = useId()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cambiar() {
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      await onCambiar(!habilitado)
    } catch (err) {
      const porDefecto = habilitado
        ? 'No se pudo apagar el asistente. Probá de nuevo en un rato.'
        : 'No se pudo prender el asistente. Probá de nuevo en un rato.'
      setError(mensajeDeLaApi(err, porDefecto))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section aria-labelledby={`${id}-titulo`} style={tarjeta}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h3 id={`${id}-titulo`} style={tituloSeccion}>Asistente en la carta</h3>
          <p style={{ ...textoAyuda, marginTop: 6, lineHeight: 1.5 }}>
            Suma a la carta de {nombreRestaurante} un chat donde los clientes preguntan por los platos y el local.
            Responde solo con lo que cargues en esta pantalla y en los datos de cada plato del Menú; no toma pedidos
            ni llama al mozo.
          </p>
        </div>
        <ToggleSwitch
          value={habilitado}
          onChange={() => { void cambiar() }}
          title="Asistente en la carta"
          disabled={guardando || !puedeCambiar}
          altoMinimo={44}
        />
      </div>

      <p
        role="status"
        style={{ ...textoAyuda, marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, color: C.text, fontSize: 13 }}
      >
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: habilitado ? C.green : C.muted }}
        />
        {guardando
          ? 'Guardando…'
          : habilitado
            ? 'Prendido: los clientes ven el asistente en la carta.'
            : 'Apagado: los clientes no ven el asistente.'}
      </p>
      {!puedeCambiar && (
        <p style={{ ...textoAyuda, marginTop: 8 }}>
          Solo el dueño de la marca puede prenderlo o apagarlo. El resto de esta pantalla la podés editar.
        </p>
      )}
      {error && <p role="alert" style={{ ...mensajeDeFalla, marginTop: 8 }}>{error}</p>}
    </section>
  )
}
