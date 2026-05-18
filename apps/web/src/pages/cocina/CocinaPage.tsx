import { useAuthStore } from '../../store/authStore'

export function CocinaPage() {
  const { logout } = useAuthStore()

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold text-orange-400">MenYu</span>
          <span className="ml-2 text-xs text-gray-400 font-medium">Cocina</span>
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-red-400 transition-colors"
        >
          Cerrar sesión
        </button>
      </header>

      <main className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center">
          <p className="text-4xl mb-4">🍳</p>
          <p className="text-gray-400 text-sm">Panel de cocina — próximamente</p>
        </div>
      </main>
    </div>
  )
}
