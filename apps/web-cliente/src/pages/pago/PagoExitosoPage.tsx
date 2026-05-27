import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function PagoExitosoPage() {
  const navigate = useNavigate()
  const [segundos, setSegundos] = useState(30)

  useEffect(() => {
    const interval = setInterval(() => {
      setSegundos((s) => {
        if (s <= 1) {
          clearInterval(interval)
          navigate('/menu')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [navigate])

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-white gap-4 p-6 text-center">
      <p className="text-5xl">✅</p>
      <p className="text-xl font-bold text-gray-900">¡Pago exitoso!</p>
      <p className="text-sm text-gray-500">Gracias por tu compra.</p>
      <p className="text-sm text-gray-400">
        Volviendo al menú en <span className="font-bold text-orange-500">{segundos}s</span>
      </p>
      <button
        onClick={() => navigate('/menu')}
        className="mt-2 text-sm text-orange-500 font-semibold underline"
      >
        Ir ahora
      </button>
    </div>
  )
}
