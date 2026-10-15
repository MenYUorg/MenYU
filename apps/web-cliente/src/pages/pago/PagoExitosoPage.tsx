import { useNavigate } from 'react-router-dom'
import { GraciasCard } from '../../components/GraciasCard'
import { useSessionStore } from '../../store/sessionStore'

const C = { bg: '#F7F7F8' } as const

export function PagoExitosoPage() {
  const navigate = useNavigate()
  const clear = useSessionStore((s) => s.clear)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: C.bg, padding: 24,
    }}>
      <GraciasCard
        subtitulo="Tu pago fue acreditado con éxito. ¡Gracias por tu visita!"
        onSalir={() => { clear(); navigate('/') }}
      />
    </div>
  )
}
