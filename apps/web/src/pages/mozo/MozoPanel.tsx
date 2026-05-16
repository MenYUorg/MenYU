import { useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useMozoStore } from '../../store/mozoStore'
import * as socketService from '../../services/socket'
import { Badge } from '../../components/ui/Badge'

export function MozoPanel() {
  const { user, logout } = useAuthStore()
  const { llamados, addLlamado, marcarAtendido } = useMozoStore()

  useEffect(() => {
    const unsub = socketService.onMozoCalled((data) => {
      addLlamado(data)
    })

    return () => {
      unsub()
      socketService.disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pendientes = llamados.filter((l) => !l.atendido)
  const atendidos = llamados.filter((l) => l.atendido)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold text-indigo-600">MenYu</span>
          <span className="ml-2 text-xs text-gray-400 font-medium">Mozo</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Llamados pendientes */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-bold text-gray-900">Llamados pendientes</h2>
            {pendientes.length > 0 && (
              <Badge variant="error">{pendientes.length}</Badge>
            )}
          </div>

          {pendientes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 px-6 py-10 text-center">
              <p className="text-2xl mb-2">✓</p>
              <p className="text-sm text-gray-400">Sin llamados pendientes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendientes.map((l) => (
                <div
                  key={l.sesionId}
                  className="bg-white rounded-xl border border-red-100 px-5 py-4 flex items-center justify-between shadow-sm"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      Mesa <span className="text-red-600">{l.mesaNumero}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {l.recibitoEn.toLocaleTimeString('es-AR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => marcarAtendido(l.sesionId)}
                    className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Atendido
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Historial */}
        {atendidos.length > 0 && (
          <section>
            <h2 className="text-base font-bold text-gray-900 mb-4">Historial de hoy</h2>
            <div className="space-y-2">
              {atendidos.map((l) => (
                <div
                  key={l.sesionId}
                  className="bg-white rounded-xl border border-gray-100 px-5 py-3 flex items-center justify-between opacity-60"
                >
                  <p className="text-sm text-gray-600">
                    Mesa {l.mesaNumero}
                  </p>
                  <Badge variant="success">Atendido</Badge>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
