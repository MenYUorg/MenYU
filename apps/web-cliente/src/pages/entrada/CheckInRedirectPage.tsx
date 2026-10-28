import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AbriendoMesaScreen, CheckInFalloScreen } from '../../components/CheckInScreens'
import { useEntrarAMesa } from '../../hooks/useEntrarAMesa'
import { useSessionStore } from '../../store/sessionStore'

type Estado = 'abriendo' | 'qr' | 'red' | 'cerrado'

/**
 * Sin respuesta del servidor, o respuesta de que está caído o saturado: volver a intentar puede andar. Con cualquier
 * otra respuesta (la mesa no existe, el pedido es inválido) el QR no sirve y reintentar da lo mismo.
 */
const sePuedeReintentar = (status: number | null) => status === null || status === 429 || status >= 500

/** 403: el restaurante (o su marca) está dado de baja y no abre mesas nuevas. El QR está bien: no se manda a probar con el PIN. */
const estaDadoDeBaja = (status: number | null) => status === 403

const estadoDelFallo = (status: number | null): Estado => (estaDadoDeBaja(status) ? 'cerrado' : sePuedeReintentar(status) ? 'red' : 'qr')

/**
 * Es la dirección que codifican los QR impresos de las mesas (`/check-in?restaurantId=…&tableCode=…`). Abre la mesa y
 * sigue al menú; mientras abre muestra "Abriendo tu mesa…" y, si no se puede, dice por qué y ofrece el PIN.
 *
 * Con el código de la mesa siempre se abre, aunque haya una sesión guardada: el servidor devuelve la misma si sigue
 * abierta y abre una nueva si ya se cerró (el id guardado no dice cuál de las dos es). No se manda el código de sesión
 * guardado: con una sesión nueva en modo seguro sería incorrecto, y si la mesa lo pide aparece su pantalla.
 */
export default function CheckInRedirectPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sesionId = useSessionStore((s) => s.sesionId)
  const tableCode = params.get('tableCode')
  const restauranteId = params.get('restaurantId')
  // Un link sin el código de la mesa no se puede abrir: se avisa sin llamar al servidor.
  const [estado, setEstado] = useState<Estado>(tableCode || sesionId ? 'abriendo' : 'qr')
  const iniciado = useRef(false)

  const volverAlInicio = () => navigate('/', { replace: true })
  const { entrar, pantalla } = useEntrarAMesa({
    reemplazar: true,
    alFallar: ({ status }) => setEstado(estadoDelFallo(status)),
    alVolver: volverAlInicio,
  })
  // Con el restaurante del link, el servidor comprueba que la mesa sea de ese restaurante (409 si no).
  const abrirLaMesa = (qrToken: string) => entrar(restauranteId ? { qrToken, restauranteId } : { qrToken })

  useEffect(() => {
    // En desarrollo StrictMode corre el efecto dos veces: la sesión se abre una sola vez.
    if (iniciado.current) return
    iniciado.current = true

    if (tableCode) {
      void abrirLaMesa(tableCode)
    } else if (sesionId) {
      // Sin el código de la mesa no hay qué abrir: con una sesión guardada se sigue en ella.
      navigate('/menu', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reintentar = () => {
    if (!tableCode) return
    setEstado('abriendo')
    void abrirLaMesa(tableCode)
  }

  // Las pantallas del modo seguro (anfitrión, código de la mesa) van en lugar de las de este flujo.
  if (pantalla) return pantalla
  if (estado === 'abriendo') return <AbriendoMesaScreen />
  return <CheckInFalloScreen motivo={estado} restauranteId={restauranteId} onReintentar={reintentar} />
}
