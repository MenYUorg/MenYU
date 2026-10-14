import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AbriendoMesaScreen, CheckInFalloScreen } from '../../components/CheckInScreens'
import { useEntrarAMesa } from '../../hooks/useEntrarAMesa'
import { useSessionStore } from '../../store/sessionStore'

type Estado = 'abriendo' | 'qr' | 'red'

/**
 * Sin respuesta del servidor, o respuesta de que está caído o saturado: volver a intentar puede andar. Con cualquier
 * otra respuesta (la mesa no existe, el pedido es inválido) el QR no sirve y reintentar da lo mismo.
 */
const sePuedeReintentar = (status: number | null) => status === null || status === 429 || status >= 500

/**
 * Es la dirección que codifican los QR impresos de las mesas (`/check-in?restaurantId=…&tableCode=…`). Abre la mesa y
 * sigue al menú; mientras abre muestra "Abriendo tu mesa…" y, si no se puede, dice por qué y ofrece el PIN.
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
    alFallar: ({ status }) => setEstado(sePuedeReintentar(status) ? 'red' : 'qr'),
    alVolver: volverAlInicio,
  })

  useEffect(() => {
    // En desarrollo StrictMode corre el efecto dos veces: la sesión se abre una sola vez.
    if (iniciado.current) return
    iniciado.current = true

    if (sesionId) {
      navigate('/menu', { replace: true })
      return
    }
    if (tableCode) void entrar({ qrToken: tableCode })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reintentar = () => {
    if (!tableCode) return
    setEstado('abriendo')
    void entrar({ qrToken: tableCode })
  }

  // Las pantallas del modo seguro (anfitrión, código de la mesa) van en lugar de las de este flujo.
  if (pantalla) return pantalla
  if (estado === 'abriendo') return <AbriendoMesaScreen />
  return <CheckInFalloScreen motivo={estado} restauranteId={restauranteId} onReintentar={reintentar} />
}
