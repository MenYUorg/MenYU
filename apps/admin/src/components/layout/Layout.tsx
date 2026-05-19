import type { ReactNode } from 'react'
import { useAuthStore } from '../../store/authStore'
import { Select } from '../ui/Select'
import type { PageKey } from '../../App'

interface LayoutProps {
  children: ReactNode
  currentPage: PageKey
  onNavigate: (page: PageKey) => void
}

const NAV_ITEMS: { label: string; key: PageKey }[] = [
  { label: 'Catálogo', key: 'menu' },
  { label: 'Mesas', key: 'mesas' },
  { label: 'Gerentes', key: 'gerentes' },
]

const PAGE_TITLES: Record<PageKey, string> = {
  menu: 'Gestión del Catálogo',
  mesas: 'Gestión de Mesas',
  gerentes: 'Gestión de Gerentes',
}

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const {
    user,
    marcas,
    restaurantes,
    selectedMarcaId,
    selectedRestauranteId,
    setMarca,
    setRestaurante,
    logout,
  } = useAuthStore()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-100">
          <span className="text-lg font-bold text-indigo-600">MenYu</span>
          <span className="ml-1.5 text-xs text-gray-400 font-medium">Admin</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
                currentPage === item.key
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
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

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
          <h1 className="text-sm font-semibold text-gray-800 mr-auto">{PAGE_TITLES[currentPage]}</h1>

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

        {/* Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
