import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@menyu/auth'
import { Select } from '@menyu/ui'
import { useContextStore } from '../../store/contextStore'

const NAV = [
  { to: '/admin/menu', label: 'Catálogo' },
  { to: '/admin/tables', label: 'Mesas' },
]

export function AdminLayout() {
  const { user, logout } = useAuth()
  const { marcas, restaurantes, selectedMarcaId, selectedRestauranteId, setMarca, setRestaurante } =
    useContextStore()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <span className="text-lg font-bold text-indigo-600">MenYu</span>
          <span className="ml-1.5 text-xs text-gray-400 font-medium">Admin</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 truncate mb-2">{user?.email}</p>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
          <span className="text-sm font-semibold text-gray-800 mr-auto">
            Panel de administración
          </span>
          {marcas.length > 1 && (
            <Select
              value={selectedMarcaId ?? ''}
              onChange={(e) => {
                if (e.target.value) setMarca(e.target.value)
              }}
              options={marcas.map((m) => ({ value: m.id, label: m.nombre }))}
              className="w-40 py-1.5 text-xs"
            />
          )}
          {restaurantes.length > 1 && (
            <Select
              value={selectedRestauranteId ?? ''}
              onChange={(e) => {
                if (e.target.value) setRestaurante(e.target.value)
              }}
              options={restaurantes.map((r) => ({ value: r.id, label: r.nombre }))}
              className="w-44 py-1.5 text-xs"
            />
          )}
          {marcas.length === 1 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {marcas[0]?.nombre}
            </span>
          )}
          {restaurantes.length === 1 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {restaurantes[0]?.nombre}
            </span>
          )}
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
