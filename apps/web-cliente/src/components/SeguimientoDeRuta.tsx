import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useTituloDeLaPantalla } from '../hooks/useTituloDeLaPantalla'
import { enfocarElTituloCuandoAparezca } from '../utils/enfocarTitulo'

/**
 * Lo que una app de una sola página no hace sola al cambiar de pantalla, y un lector de pantalla necesita:
 * - el título de la pestaña dice dónde está la persona ("Carrito · Lupulus Casa Matriz", no "MenYu" en todas);
 * - al navegar dentro de la app, el foco va al `<h1>` de la pantalla nueva, que se anuncia. En la primera carga no se
 *   mueve: la página recién abierta ya empieza arriba.
 * Se monta una vez, dentro del router (App.tsx). No pinta nada.
 */
export function SeguimientoDeRuta() {
  const { pathname } = useLocation()
  const titulo = useTituloDeLaPantalla(pathname)

  useEffect(() => {
    document.title = titulo
  }, [titulo])

  // Se compara con la ruta anterior (y no con un "primera vez"): en desarrollo, StrictMode corre los efectos dos veces
  // al montar, y la segunda no tiene que contar como una navegación.
  const anterior = useRef(pathname)
  useEffect(() => {
    if (anterior.current === pathname) return
    anterior.current = pathname
    return enfocarElTituloCuandoAparezca()
  }, [pathname])

  return null
}
