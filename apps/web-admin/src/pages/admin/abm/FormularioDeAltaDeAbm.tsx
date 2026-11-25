import { useId, useState, type FormEvent } from 'react'
import { botonPrimario, conEstado } from '../marca/estilos'
import { mensajeDeFalla } from '../asistente/estilos'
import { errorDeAbm } from './errores'
import { CampoDeNombre } from './CampoDeNombre'
import { leerNombre } from './nombre'
import type { ConfigDeAbm } from './tipos'

interface FormularioDeAltaDeAbmProps {
  config: ConfigDeAbm
  restauranteId: string
  crear: (restauranteId: string, nombre: string) => Promise<unknown>
  /** Se creó el ítem: la pantalla vuelve a leer la lista. */
  onCreada: () => void
}

/** El alta de un ítem del ABM: el nombre, recortado y de hasta `maximoDelNombre` caracteres. El nombre repetido se avisa junto al campo. */
export function FormularioDeAltaDeAbm({ config, restauranteId, crear, onCreada }: FormularioDeAltaDeAbmProps) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [errorDelNombre, setErrorDelNombre] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const nombre = leerNombre(texto, config.maximoDelNombre, config.mensajeNombreVacio)
    if (!nombre.ok) {
      setErrorDelNombre(nombre.mensaje)
      return
    }
    setErrorDelNombre(null)
    setEnviando(true)
    try {
      await crear(restauranteId, nombre.valor)
      setTexto('')
      onCreada()
    } catch (err) {
      const { mensaje, delNombre } = errorDeAbm(err, config.errorAlCrear, config)
      if (delNombre) setErrorDelNombre(mensaje)
      else setError(mensaje)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => void enviar(e)} className="flex flex-col gap-2">
      <CampoDeNombre
        id={id}
        etiqueta={config.etiquetaDelCampo}
        maximo={config.maximoDelNombre}
        valor={texto}
        error={errorDelNombre}
        placeholder={config.placeholderDelAlta}
        onChange={(valor) => {
          setTexto(valor)
          setErrorDelNombre(null)
          setError(null)
        }}
      >
        <button type="submit" disabled={enviando} style={conEstado(botonPrimario, enviando)}>{config.textoDelBotonDeAlta}</button>
      </CampoDeNombre>
      {error !== null && <p role="alert" style={mensajeDeFalla}>{error}</p>}
    </form>
  )
}
