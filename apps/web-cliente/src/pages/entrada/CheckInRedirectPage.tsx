import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnfitrionScreen, CodigoSesionScreen } from '../../components/SesionSeguraModals'
import { useSessionStore } from '../../store/sessionStore'

export default function CheckInRedirectPage() {
  const navigate = useNavigate()
  const { openSession, sesionId, error: sessionError, loading } = useSessionStore()

  const [pendingTableCode, setPendingTableCode] = useState<string | null>(null)
  const [showCodigoModal, setShowCodigoModal] = useState(false)
  const [showAnfitrionModal, setShowAnfitrionModal] = useState(false)
  const [anfitrionCodigo, setAnfitrionCodigo] = useState<string | null>(null)

  function handleOpenResult(result: Awaited<ReturnType<typeof openSession>>) {
    if (result && !result.error) {
      if (result.esAnfitrion && result.modoSesion === 'seguro') {
        setAnfitrionCodigo(result.codigoSesion)
        setShowAnfitrionModal(true)
      } else {
        navigate('/menu', { replace: true })
      }
    } else if (result?.error === 'REQUIERE_CODIGO_SESION') {
      setShowCodigoModal(true)
    } else {
      navigate('/', { replace: true })
    }
  }

  useEffect(() => {
    if (sesionId) {
      navigate('/menu', { replace: true })
      return
    }

    const params = new URLSearchParams(window.location.search)
    const tableCode = params.get('tableCode')

    if (!tableCode) {
      navigate('/', { replace: true })
      return
    }

    setPendingTableCode(tableCode)
    openSession({ qrToken: tableCode }).then(handleOpenResult)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitCodigo = async (codigo: string) => {
    if (!pendingTableCode) return
    const result = await openSession({ qrToken: pendingTableCode, codigoSesion: codigo })
    if (result && !result.error) {
      setShowCodigoModal(false)
      handleOpenResult(result)
    }
    // si falla, sessionStore.error queda seteado y se muestra dentro del modal
  }

  if (showAnfitrionModal) {
    return <AnfitrionScreen codigo={anfitrionCodigo} onContinuar={() => navigate('/menu', { replace: true })} />
  }

  if (showCodigoModal) {
    return (
      <CodigoSesionScreen
        loading={loading}
        error={sessionError}
        onSubmit={(codigo) => void handleSubmitCodigo(codigo)}
        onVolver={() => navigate('/', { replace: true })}
      />
    )
  }

  return null
}
