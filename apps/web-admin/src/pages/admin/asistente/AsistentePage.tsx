import { useCallback, useEffect, useState } from 'react'
import type { InformacionLocal, PreguntaFrecuente } from '@menyu/types'
import { api, type GuardarInformacionLocalInput, type PreguntaFrecuenteInput } from '../../../services/api'
import { useContextStore } from '../../../store/contextStore'
import { mensajeDeLaApi } from '../../../utils/mensajeDeError'
import { botonSecundario, textoAyuda } from '../marca/estilos'
import { mensajeDeFalla } from './estilos'
import { InformacionLocalForm } from './InformacionLocalForm'
import { InterruptorDelAsistente } from './InterruptorDelAsistente'
import { PreguntasFrecuentes } from './PreguntasFrecuentes'

interface Lista {
  estado:        'lista'
  /** De qué restaurante son los datos: al cambiarlo en el menú lateral, hasta que lleguen los nuevos es "cargando". */
  restauranteId: string
  informacion:   InformacionLocal
  preguntas:     PreguntaFrecuente[]
}

type Carga = { estado: 'cargando' } | { estado: 'error'; mensaje: string } | Lista

/**
 * Lo que sabe el asistente de la carta sobre el restaurante elegido, además de los platos: el interruptor que lo
 * prende, la información del local y las preguntas frecuentes. OWNER y GERENTE (docs/asistente/specs/asistente.md).
 */
export function AsistentePage() {
  const { selectedRestauranteId: restauranteId, restaurantes } = useContextStore()
  const nombre = restaurantes.find((r) => r.id === restauranteId)?.nombre ?? 'este restaurante'
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!restauranteId) return
    let vigente = true
    setCarga({ estado: 'cargando' })
    Promise.all([api.asistente.informacion(restauranteId), api.asistente.preguntas.listar(restauranteId)])
      .then(([informacion, preguntas]) => {
        if (vigente) setCarga({ estado: 'lista', restauranteId, informacion, preguntas })
      })
      .catch((err: unknown) => {
        if (vigente) {
          setCarga({ estado: 'error', mensaje: mensajeDeLaApi(err, 'No se pudo cargar la información del asistente.') })
        }
      })
    return () => { vigente = false }
  }, [restauranteId, intento])

  /**
   * Cambia lo que ya está cargado, después de guardar algo. Si mientras tanto se eligió otro restaurante, no toca
   * nada: la respuesta es del anterior.
   */
  const actualizar = useCallback(
    (de: string, cambio: (lista: Lista) => Partial<Omit<Lista, 'estado' | 'restauranteId'>>) =>
      setCarga((actual) =>
        actual.estado === 'lista' && actual.restauranteId === de ? { ...actual, ...cambio(actual) } : actual,
      ),
    [],
  )

  if (!restauranteId || carga.estado === 'cargando' || (carga.estado === 'lista' && carga.restauranteId !== restauranteId)) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <p role="status" style={{ ...textoAyuda, fontSize: 14 }}>Cargando…</p>
      </div>
    )
  }

  if (carga.estado === 'error') {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6 space-y-3">
        <p role="alert" style={{ ...mensajeDeFalla, fontSize: 14 }}>{carga.mensaje}</p>
        <button type="button" onClick={() => setIntento((n) => n + 1)} style={botonSecundario}>
          Reintentar
        </button>
      </div>
    )
  }

  const guardarInformacion = (datos: GuardarInformacionLocalInput) =>
    api.asistente.guardarInformacion(restauranteId, datos)

  return (
    // El restaurante va en la key: al cambiarlo en el menú lateral, los formularios arrancan de cero.
    <div key={restauranteId} className="mx-auto w-full max-w-3xl p-4 md:p-6 space-y-6">
      <InterruptorDelAsistente
        nombreRestaurante={nombre}
        habilitado={carga.informacion.asistenteHabilitado}
        onCambiar={async (habilitado) => {
          const guardada = await guardarInformacion({ asistenteHabilitado: habilitado })
          // Solo el interruptor: el resto de la información lo maneja su formulario, que puede tener cambios sin guardar.
          actualizar(restauranteId, (lista) => ({
            informacion: { ...lista.informacion, asistenteHabilitado: guardada.asistenteHabilitado },
          }))
        }}
      />

      <InformacionLocalForm informacion={carga.informacion} onGuardar={guardarInformacion} />

      <PreguntasFrecuentes
        preguntas={carga.preguntas}
        onCrear={async (datos: PreguntaFrecuenteInput) => {
          const nueva = await api.asistente.preguntas.crear(restauranteId, datos)
          actualizar(restauranteId, (lista) => ({ preguntas: [...lista.preguntas, nueva] }))
        }}
        onEditar={async (id, datos) => {
          const editada = await api.asistente.preguntas.editar(restauranteId, id, datos)
          actualizar(restauranteId, (lista) => ({ preguntas: lista.preguntas.map((p) => (p.id === id ? editada : p)) }))
        }}
        onBorrar={async (id) => {
          await api.asistente.preguntas.borrar(restauranteId, id)
          actualizar(restauranteId, (lista) => ({ preguntas: lista.preguntas.filter((p) => p.id !== id) }))
        }}
      />
    </div>
  )
}
