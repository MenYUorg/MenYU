import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnfitrionScreen, CodigoSesionScreen } from '../components/SesionSeguraModals'
import { useSessionStore } from '../store/sessionStore'

/**
 * Cómo se identifica la mesa: con el código del QR (y, si ya se eligió un restaurante, cuál: la mesa tiene que ser de
 * ese restaurante) o con el PIN de una mesa del restaurante.
 */
export type DatosEntrada = { qrToken: string; restauranteId?: string } | { pin: string; restauranteId: string }

/** Por qué falló: el código HTTP de la respuesta, o `null` si no hubo respuesta (sin conexión o servidor caído). */
export interface FalloDeEntrada {
  status: number | null
}

type Resultado = Awaited<ReturnType<ReturnType<typeof useSessionStore.getState>['openSession']>>

interface OpcionesEntrarAMesa {
  /** Reemplaza la entrada del historial al ir al menú, para que el link de `/check-in` no quede para volver atrás. */
  reemplazar?: boolean
  /** La sesión no se pudo abrir (la mesa no existe, es de otro restaurante, no hay conexión, etc.). */
  alFallar?: (fallo: FalloDeEntrada) => void
  /** Se tocó "Volver" en la pantalla del código de la mesa (la pantalla ya se cerró). */
  alVolver?: () => void
}

/**
 * Abre la sesión de una mesa y resuelve lo que sigue: al menú, a la pantalla del anfitrión (modo seguro) o a la del
 * código de la mesa (modo seguro, cuando la mesa ya tiene anfitrión). Si hay una de esas pantallas, `pantalla` la
 * trae y la página que usa el hook tiene que mostrarla en lugar de su contenido.
 */
export function useEntrarAMesa({ reemplazar = false, alFallar, alVolver }: OpcionesEntrarAMesa = {}) {
  const navigate = useNavigate()
  const openSession = useSessionStore((s) => s.openSession)
  const cargando = useSessionStore((s) => s.loading)
  const errorDeSesion = useSessionStore((s) => s.error)

  const pendiente = useRef<DatosEntrada | null>(null)
  const [vista, setVista] = useState<'anfitrion' | 'codigo' | null>(null)
  const [codigoAnfitrion, setCodigoAnfitrion] = useState<string | null>(null)

  const irAlMenu = () => navigate('/menu', reemplazar ? { replace: true } : undefined)

  const resolver = (resultado: Resultado) => {
    if (resultado && !resultado.error) {
      if (resultado.esAnfitrion && resultado.modoSesion === 'seguro') {
        setCodigoAnfitrion(resultado.codigoSesion)
        setVista('anfitrion')
      } else {
        irAlMenu()
      }
    } else if (resultado?.error === 'REQUIERE_CODIGO_SESION') {
      setVista('codigo')
    } else {
      alFallar?.({ status: useSessionStore.getState().errorStatus })
    }
  }

  const entrar = async (datos: DatosEntrada) => {
    pendiente.current = datos
    resolver(await openSession(datos))
  }

  const enviarCodigo = async (codigo: string) => {
    if (!pendiente.current) return
    const resultado = await openSession({ ...pendiente.current, codigoSesion: codigo })
    if (resultado && !resultado.error) {
      setVista(null)
      resolver(resultado)
    }
    // Si falla, el error queda en el store y se muestra dentro de la pantalla del código.
  }

  let pantalla: ReactNode = null
  if (vista === 'anfitrion') {
    pantalla = <AnfitrionScreen codigo={codigoAnfitrion} onContinuar={irAlMenu} />
  } else if (vista === 'codigo') {
    pantalla = (
      <CodigoSesionScreen
        loading={cargando}
        error={errorDeSesion}
        onSubmit={(codigo) => void enviarCodigo(codigo)}
        onVolver={() => {
          setVista(null)
          alVolver?.()
        }}
      />
    )
  }

  return { entrar, cargando, pantalla }
}
