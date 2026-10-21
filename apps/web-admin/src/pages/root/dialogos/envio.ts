import { useCallback, useState } from 'react'
import { ApiError } from '../../../services/api'
import { esSinConexion } from '../useCarga'

/** Lo que se le muestra a ROOT cuando una acción falla. Un error del servidor (4xx) trae su propio texto, ya en español. */
export function mensajeDeEnvio(error: unknown): string {
  if (esSinConexion(error)) return 'Sin conexión. Revisá tu internet y probá de nuevo.'
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.message) return error.message
  return 'No pudimos completar la acción. Probá de nuevo en un momento.'
}

/**
 * El envío de un diálogo: evita el doble toque (`ocupado`), guarda el error para mostrarlo en el mismo diálogo y avisa cuando
 * salió bien. `alFallar` puede quedarse con un error que tiene un lugar propio (el 409 de un identificador repetido va debajo
 * del campo): si devuelve `true`, no se muestra el aviso general.
 */
export function useEnvio() {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const enviar = useCallback(
    async <T,>(accion: () => Promise<T>, alExito: (resultado: T) => void, alFallar?: (error: unknown) => boolean) => {
      setOcupado(true)
      setError('')
      try {
        const resultado = await accion()
        setOcupado(false)
        alExito(resultado)
      } catch (e) {
        setOcupado(false)
        if (!alFallar?.(e)) setError(mensajeDeEnvio(e))
      }
    },
    [],
  )

  return { ocupado, error, enviar, limpiarError: () => setError('') }
}
