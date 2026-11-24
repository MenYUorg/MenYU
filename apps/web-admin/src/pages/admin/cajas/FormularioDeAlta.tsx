import { useId, useState, type FormEvent } from 'react'
import { api } from '../../../services/api'
import { botonPrimario, conEstado } from '../marca/estilos'
import { mensajeDeFalla } from '../asistente/estilos'
import { errorDeCaja } from './errores'
import { CampoDeNombre } from './CampoDeNombre'
import { leerNombreDeCaja } from './nombre'

interface FormularioDeAltaProps {
  restauranteId: string
  /** Se creó la caja: la pantalla vuelve a leer la lista. */
  onCreada: () => void
}

/** Crear una caja (#360): el nombre, recortado y de hasta 60 caracteres. El nombre repetido se avisa junto al campo. */
export function FormularioDeAlta({ restauranteId, onCreada }: FormularioDeAltaProps) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [errorDelNombre, setErrorDelNombre] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function crear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const nombre = leerNombreDeCaja(texto)
    if (!nombre.ok) {
      setErrorDelNombre(nombre.mensaje)
      return
    }
    setErrorDelNombre(null)
    setEnviando(true)
    try {
      await api.cajas.crear(restauranteId, nombre.valor)
      setTexto('')
      onCreada()
    } catch (err) {
      const { mensaje, delNombre } = errorDeCaja(err, 'No se pudo crear la caja')
      if (delNombre) setErrorDelNombre(mensaje)
      else setError(mensaje)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => void crear(e)} className="flex flex-col gap-2">
      <CampoDeNombre
        id={id}
        valor={texto}
        error={errorDelNombre}
        placeholder="Ej: Caja principal"
        onChange={(valor) => {
          setTexto(valor)
          setErrorDelNombre(null)
          setError(null)
        }}
      >
        <button type="submit" disabled={enviando} style={conEstado(botonPrimario, enviando)}>Agregar caja</button>
      </CampoDeNombre>
      {error !== null && <p role="alert" style={mensajeDeFalla}>{error}</p>}
    </form>
  )
}
