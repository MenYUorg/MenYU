import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../../store/sessionStore'

export default function CheckInRedirectPage() {
  const navigate = useNavigate()
  const { openSession, sesionId } = useSessionStore()

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

    openSession({ qrToken: tableCode }).then(result => {
      if (result && !result.error) {
        navigate('/menu', { replace: true })
      } else if (result?.error === 'REQUIERE_CODIGO_SESION') {
        navigate('/menu', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
