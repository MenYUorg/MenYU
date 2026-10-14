import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEntrarAMesa } from '../../hooks/useEntrarAMesa'
import { useSessionStore } from '../../store/sessionStore'

export default function CheckInRedirectPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sesionId = useSessionStore((s) => s.sesionId)
  const iniciado = useRef(false)

  const volverAlInicio = () => navigate('/', { replace: true })
  const { entrar, pantalla } = useEntrarAMesa({
    reemplazar: true,
    alFallar: volverAlInicio,
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

    const tableCode = params.get('tableCode')
    if (!tableCode) {
      volverAlInicio()
      return
    }

    void entrar({ qrToken: tableCode })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return pantalla
}
