import { useCallback, useEffect, useRef, useState } from 'react'
import type { Comanda } from '@menyu/types'
import { api } from '../services/api'

/**
 * Las comandas del restaurante (activas y no), de `GET /comandas`, para las pantallas que filtran o avisan por comanda
 * (Cocina y el kanban del mozo).
 *
 * - Al cambiar de restaurante la lista se vacía y se vuelve a pedir; la respuesta tardía de un restaurante anterior se descarta.
 * - Ante un fallo se conserva la última lista buena; si nunca cargó queda vacía (sin lista no hay filtro ni avisos). No es un
 *   error de pedidos, así que no se informa.
 * - `recargar` vuelve a pedirla (el botón "Actualizar").
 */
export function useComandas(restauranteId: string | null) {
  const [comandas, setComandas] = useState<Comanda[]>([])
  // Lo que leen las respuestas tardías sin volver a crearse; se sincroniza en un efecto, antes del que carga.
  const restauranteIdRef = useRef(restauranteId)

  const recargar = useCallback(async () => {
    if (!restauranteId) return
    try {
      const lista = await api.comandas.listar(restauranteId)
      if (restauranteIdRef.current !== restauranteId) return   // respuesta de un restaurante anterior
      setComandas(lista)
    } catch { /* sin comandas no hay filtro; no es un error de pedidos */ }
  }, [restauranteId])

  useEffect(() => { restauranteIdRef.current = restauranteId }, [restauranteId])

  useEffect(() => {
    setComandas([])
    void recargar()
  }, [recargar])

  return { comandas, recargar }
}
