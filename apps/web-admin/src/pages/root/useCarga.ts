import { useCallback, useEffect, useRef, useState } from 'react'

export type EstadoDeCarga = 'cargando' | 'ok' | 'error' | 'sin-conexion'

/**
 * ¿La llamada falló por falta de red y no por un error del servidor? `fetch` rechaza con un `TypeError` cuando no llega al
 * servidor; un error del servidor (`ApiError`) siempre trae su código de estado.
 */
export function esSinConexion(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return error instanceof TypeError
}

/**
 * Carga datos con sus estados (cargando, ok, error, sin conexión) y los vuelve a pedir cuando cambian las dependencias.
 * Una respuesta que llega tarde, de una pedido que ya no corresponde, se descarta.
 *
 * - `recargar()`: vuelve a la pantalla de carga y pide de nuevo (el botón "Reintentar").
 * - `actualizar()`: pide de nuevo sin cambiar lo que se ve (después de guardar algo); si falla, deja lo que había.
 * - `reemplazar(datos)`: pone datos que ya llegaron (la respuesta de un cambio) sin pedir nada.
 */
export function useCarga<T>(cargar: () => Promise<T>, dependencias: ReadonlyArray<unknown>) {
  const [estado, setEstado] = useState<EstadoDeCarga>('cargando')
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const ultimo = useRef(0)
  const funcion = useRef(cargar)
  funcion.current = cargar

  const pedir = useCallback((enSilencio: boolean) => {
    const numero = ++ultimo.current
    if (!enSilencio) setEstado('cargando')
    funcion.current().then(
      (resultado) => {
        if (numero !== ultimo.current) return
        setDatos(resultado)
        setError(null)
        setEstado('ok')
      },
      (fallo: unknown) => {
        if (numero !== ultimo.current || enSilencio) return
        setError(fallo)
        setEstado(esSinConexion(fallo) ? 'sin-conexion' : 'error')
      },
    )
  }, [])

  useEffect(() => {
    pedir(false)
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- se invalida el pedido VIGENTE a propósito, no un valor copiado
      ultimo.current++ // lo que llegue después de desmontar o de cambiar de pedido no se usa
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias)

  const reemplazar = useCallback((nuevos: T) => {
    ultimo.current++ // un pedido en vuelo quedaría viejo respecto de estos datos
    setDatos(nuevos)
    setError(null)
    setEstado('ok')
  }, [])

  return {
    estado,
    datos,
    /** Lo que falló la última vez (para distinguir, por ejemplo, un 404). `null` si todo salió bien. */
    error,
    recargar: useCallback(() => pedir(false), [pedir]),
    actualizar: useCallback(() => pedir(true), [pedir]),
    reemplazar,
  }
}
