import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Boton } from '../components/Boton'
import { Cargando } from '../components/Cargando'
import { Encabezado } from '../components/Encabezado'
import { Marco } from '../components/Marco'
import { usePostLogin } from '../flujo/usePostLogin'
import { urlDeOpcion, urlsDeApps, type OpcionIngreso } from '../lib/destinos'
import { irA } from '../lib/navegar'

/** `/elegir`: el selector, para quien tiene más de un lugar al que entrar (varias membresías, o ROOT y alguna). */
export function ElegirPage() {
  const opciones = (useLocation().state as { opciones?: OpcionIngreso[] } | null)?.opciones
  const { estado, continuar, cerrarSesion } = usePostLogin()

  // Sin las opciones (por ejemplo, al recargar la página) se vuelven a pedir: continuar() trae de vuelta acá con ellas.
  const pedidas = useRef(false)
  useEffect(() => {
    if (opciones || pedidas.current) return
    pedidas.current = true
    void continuar()
  }, [opciones, continuar])

  if (!opciones) {
    return (
      <Marco titulo="Elegir dónde entrar">
        {estado.tipo === 'sin-verificar' || estado.tipo === 'sesion-vencida' ? (
          <>
            <Encabezado titulo="No pudimos entrar">{estado.mensaje}</Encabezado>
            <Boton variante="secundario" onClick={() => void cerrarSesion()}>
              Volver a ingresar
            </Boton>
          </>
        ) : (
          <Cargando texto="Entrando…" />
        )}
      </Marco>
    )
  }

  const urls = urlsDeApps()

  return (
    <Marco titulo="Elegir dónde entrar">
      <Encabezado titulo="¿Dónde querés entrar?">Tu cuenta tiene acceso a más de un lugar.</Encabezado>

      <ul className="divide-y divide-menyu-linea border-y border-menyu-linea">
        {opciones.map((opcion) => (
          <li key={opcion.clave}>
            <button
              type="button"
              onClick={() => irA(urlDeOpcion(opcion, urls))}
              className="group flex w-full items-center gap-4 py-4 pl-4 pr-3 text-left transition-colors hover:bg-menyu-fondo focus:outline-none focus-visible:bg-menyu-fondo focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-menyu-coral"
            >
              <span
                aria-hidden="true"
                className="h-9 w-1 shrink-0 rounded-full bg-menyu-linea transition-colors group-hover:bg-menyu-coral group-focus-visible:bg-menyu-coral"
              />
              <span className="min-w-0">
                <span className="block truncate font-titulo text-lg font-bold">{opcion.lugar}</span>
                <span className="block text-sm text-menyu-gris">{opcion.rol}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => void cerrarSesion()}
        className="mt-6 text-sm font-medium text-menyu-gris underline underline-offset-4 hover:text-menyu-navy focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-menyu-coral"
      >
        Cerrar sesión
      </button>
    </Marco>
  )
}
