import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import { useMozoStore } from '../../store/mozoStore'

export function SelectorPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { setRestauranteId } = useMozoStore()

  // Si el JWT ya trae restauranteId (mozo/gerente), lo usamos directo
  const [rid, setRid] = useState(user?.restauranteId ?? '')

  function ir(destino: '/cocina' | '/mozo') {
    if (!rid.trim()) return
    setRestauranteId(rid.trim())
    navigate(destino)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <span className="text-3xl font-bold text-orange-400">MenYu</span>
        <p className="text-sm text-gray-400 mt-1">{user?.email}</p>
      </div>

      {/* Solo se muestra si el JWT no trae restauranteId (ej: ROOT) */}
      {!user?.restauranteId && (
        <div className="w-full max-w-xs">
          <label className="block text-xs text-gray-400 mb-1">ID del restaurante</label>
          <input
            value={rid}
            onChange={(e) => setRid(e.target.value)}
            placeholder="22222222-2222-4222-a222-..."
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-orange-400"
          />
        </div>
      )}

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => ir('/cocina')}
          disabled={!rid.trim()}
          className="w-full py-4 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-bold rounded-xl text-lg transition-colors"
        >
          Panel Cocina
        </button>
        <button
          onClick={() => ir('/mozo')}
          disabled={!rid.trim()}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl text-lg transition-colors"
        >
          Panel Mozo
        </button>
      </div>

      <button onClick={logout} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
        Cerrar sesión
      </button>
    </div>
  )
}
